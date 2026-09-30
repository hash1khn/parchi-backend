import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { PartnerVerificationsService, buildMatchOptions } from './partner-verifications.service';
import { RateLimiterService } from '../../common/rate-limit/rate-limiter.service';
import { ROLES } from '../../constants/app.constants';
import { hashPartnerKey, PLACEHOLDER_PARTNER_KEY_HASH } from '../../utils/partner-key.util';

type Row = Record<string, any>;

/**
 * In-memory stand-in for Prisma with the SAME conditional-write semantics the service relies on
 * (updateMany evaluates its WHERE at write time, atomically). Transactions are serialised, which
 * models the per-(student, partner) advisory lock. This validates the service logic; true
 * Postgres concurrency (advisory lock + unique partial index) needs an integration test DB.
 */
function makeFakePrisma() {
  const rows: Row[] = [];
  const keys: Row[] = [];
  let seq = 0;
  let txChain: Promise<unknown> = Promise.resolve();

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (k === 'OR' && Array.isArray(cond)) {
        return cond.some((clause) => matches(row, clause));
      }
      const v = row[k];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('gt' in cond && !(v > cond.gt)) return false;
        if ('lte' in cond && !(v <= cond.lte)) return false;
        if ('lt' in cond && !(v < cond.lt)) return false;
        if ('not' in cond && v === cond.not) return false;
        return true;
      }
      return v === cond;
    });

  const students: Row[] = [];
  const discountRows: Row[] = [];
  let discountChain: Promise<unknown> = Promise.resolve();
  const prisma: any = {
    rows,
    keys,
    discountRows,
    students: {
      list: students,
      findUnique: jest.fn(async ({ where }: any) =>
        students.find((s) =>
          where.parchi_id ? s.parchi_id === where.parchi_id : s.user_id === where.user_id,
        ) ?? null,
      ),
    },
    partner_api_keys: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = keys.filter((k) => matches(k, where));
        hit.forEach((k) => Object.assign(k, data));
        return { count: hit.length };
      }),
      findUnique: jest.fn(async ({ where }: any) => keys.find((k) => k.partner_name === where.partner_name) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const k = { id: `key-${++seq}`, ...data };
        keys.push(k);
        return k;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const k = keys.find((x) => x.id === where.id)!;
        Object.assign(k, data);
        return k;
      }),
    },
    partner_verification_requests: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (!r) return null;
        const out: Row = { ...r };
        if (include?.partner_api_keys) {
          out.partner_api_keys = { partner_name: 'inside_karachi' };
        }
        if (include?.students) {
          const s = students.find((x) => x.id === r.student_id);
          out.students = { parchi_id: s?.parchi_id ?? null };
        }
        return out;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.sort((a, b) => b.created_at - a.created_at);
        return hit[0] ? { ...hit[0] } : null;
      }),
      count: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
      create: jest.fn(async ({ data }: any) => {
        // mirrors uq_partner_verify_one_pending
        if (
          data.status === 'pending' &&
          rows.some(
            (r) => r.student_id === data.student_id && r.partner_id === data.partner_id && r.status === 'pending',
          )
        ) {
          throw new Error('unique violation: uq_partner_verify_one_pending');
        }
        const row = {
          id: `req-${++seq}`,
          created_at: new Date(Date.now() + seq), // strictly increasing
          approved_at: null,
          rejected_at: null,
          push_status: null,
          ...data,
        };
        rows.push(row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return { ...r };
      }),
    },
    partner_discount_redemptions: {
      findUnique: jest.fn(async ({ where }: any) => {
        const r = discountRows.find((x) => x.id === where.id);
        return r ? { ...r } : null;
      }),
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const hit = discountRows.filter((r) => matches(r, where));
        if (orderBy?.created_at === 'asc') hit.sort((a, b) => a.created_at - b.created_at);
        return hit[0] ? { ...hit[0] } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const run = discountChain.then(async () => {
          const dup = discountRows.some(
            (r) =>
              r.verification_request_id === data.verification_request_id ||
              (r.partner_id === data.partner_id && r.external_reference === data.external_reference),
          );
          if (dup) {
            const err: any = new Error('Unique constraint failed');
            err.code = 'P2002';
            throw err;
          }
          const row = {
            id: `disc-${++seq}`,
            created_at: new Date(Date.now() + seq),
            ...data,
          };
          discountRows.push(row);
          return { ...row };
        });
        discountChain = run.catch(() => undefined);
        return run;
      }),
    },
    $executeRawUnsafe: jest.fn(async () => 1),
    $transaction: jest.fn((fn: any) => {
      const run = txChain.then(() => fn(prisma));
      txChain = run.catch(() => undefined);
      return run;
    }),
  };
  return prisma;
}

describe('PartnerVerificationsService', () => {
  const partner = { id: 'partner-1', partnerName: 'inside_karachi' };
  const studentUser = { id: 'user-1', role: ROLES.STUDENT } as any;
  const otherUser = { id: 'user-2', role: ROLES.STUDENT } as any;

  let prisma: ReturnType<typeof makeFakePrisma>;
  let audit: { logCreate: jest.Mock; logAction: jest.Mock };
  let notifications: { sendPersonalNotification: jest.Mock };
  let config: { get: jest.Mock };
  let service: PartnerVerificationsService;

  const addStudent = (over: Row = {}) => {
    prisma.students.list.push({
      id: 'stu-1',
      user_id: 'user-1',
      parchi_id: '48219',
      verification_status: 'approved',
      users: { is_active: true },
      ...over,
    });
  };

  const dto = (over: Row = {}) => ({ parchiId: '48219', externalReference: 'order-1', eventLabel: 'Show', ...over });

  beforeEach(() => {
    prisma = makeFakePrisma();
    audit = { logCreate: jest.fn(), logAction: jest.fn() };
    notifications = { sendPersonalNotification: jest.fn().mockResolvedValue({ success: true, successCount: 1 }) };
    config = { get: jest.fn() };
    service = new PartnerVerificationsService(
      prisma,
      audit as any,
      notifications as any,
      config as any,
      new RateLimiterService(),
    );
    addStudent();
    addStudent({ id: 'stu-2', user_id: 'user-2', parchi_id: '11111' });
  });

  describe('createRequest', () => {
    it('creates a pending request with a match code and returns no student PII', async () => {
      const res: any = await service.createRequest(dto(), partner);
      expect(res.status).toBe('pending');
      expect(res.matchCode).toMatch(/^\d{2}$/);
      expect(JSON.stringify(res)).not.toMatch(/first|last|university|email|parchiId|user/i);
      expect(audit.logCreate).toHaveBeenCalledTimes(1);
      const payload = audit.logCreate.mock.calls[0][3];
      expect(payload).not.toHaveProperty('firstName');
      expect(payload).not.toHaveProperty('university');
    });

    it('is idempotent for the same externalReference (same request, one row, one audit)', async () => {
      const a: any = await service.createRequest(dto(), partner);
      const b: any = await service.createRequest(dto(), partner);
      expect(b.requestId).toBe(a.requestId);
      expect(prisma.rows).toHaveLength(1);
      expect(audit.logCreate).toHaveBeenCalledTimes(1);
    });

    it('concurrent creates with different references leave exactly one pending row', async () => {
      await Promise.all([
        service.createRequest(dto({ externalReference: 'A' }), partner),
        service.createRequest(dto({ externalReference: 'B' }), partner),
        service.createRequest(dto({ externalReference: 'C' }), partner),
      ]);
      expect(prisma.rows.filter((r: Row) => r.status === 'pending')).toHaveLength(1);
    });

    it('expires the previous pending request when a new reference arrives', async () => {
      const a: any = await service.createRequest(dto({ externalReference: 'A' }), partner);
      await service.createRequest(dto({ externalReference: 'B' }), partner);
      expect(prisma.rows.find((r: Row) => r.id === a.requestId).status).toBe('expired');
    });

    it('caps new requests per student per partner', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createRequest(dto({ externalReference: `ref-${i}` }), partner);
      }
      await expect(service.createRequest(dto({ externalReference: 'ref-6' }), partner)).rejects.toMatchObject({
        status: 429,
      });
    });

    it('creates a fresh request after the previous one expired', async () => {
      const a: any = await service.createRequest(dto(), partner);
      prisma.rows[0].expires_at = new Date(Date.now() - 1000);
      const b: any = await service.createRequest(dto(), partner);
      expect(b.requestId).not.toBe(a.requestId);
      expect(prisma.rows[0].status).toBe('expired');
    });

    it('rejects unknown, unverified and inactive students', async () => {
      await expect(service.createRequest(dto({ parchiId: '00000' }), partner)).rejects.toBeInstanceOf(NotFoundException);
      prisma.students.list[0].verification_status = 'pending';
      await expect(service.createRequest(dto(), partner)).rejects.toBeInstanceOf(ForbiddenException);
      prisma.students.list[0].verification_status = 'approved';
      prisma.students.list[0].users.is_active = false;
      await expect(service.createRequest(dto(), partner)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throttles repeated failed lookups (enumeration guard)', async () => {
      let last: any;
      for (let i = 0; i < 35; i++) {
        try {
          await service.createRequest(dto({ parchiId: String(10000 + i) }), partner);
        } catch (e) {
          last = e;
        }
      }
      expect(last).toBeInstanceOf(HttpException);
      expect(last.getStatus()).toBe(429);
    });

    it('records push status and retries a failed push on a same-reference retry', async () => {
      notifications.sendPersonalNotification.mockResolvedValueOnce({ success: false, error: 'boom' });
      await service.createRequest(dto(), partner);
      await new Promise((r) => setImmediate(r));
      expect(prisma.rows[0].push_status).toBe('failed');

      await service.createRequest(dto(), partner); // IK retry, request is reused
      await new Promise((r) => setImmediate(r));
      expect(notifications.sendPersonalNotification).toHaveBeenCalledTimes(2);
      expect(prisma.rows[0].push_status).toBe('sent');
    });

    it('does not re-send a push that already succeeded', async () => {
      await service.createRequest(dto(), partner);
      await new Promise((r) => setImmediate(r));
      await service.createRequest(dto(), partner);
      await new Promise((r) => setImmediate(r));
      expect(notifications.sendPersonalNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('partner isolation', () => {
    it('returns 404 (not 403) for another partner\'s request', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await expect(
        service.getPartnerRequest(a.requestId, { id: 'partner-2', partnerName: 'other' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getPartnerRequest('missing', partner)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('student authorization', () => {
    it('returns 404 for a request that belongs to another student (GET, approve, reject)', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await expect(service.getStudentRequest(a.requestId, otherUser)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.approveRequest(a.requestId, otherUser, { method: 'qr' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.rejectRequest(a.requestId, otherUser)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.rows[0].status).toBe('pending');
    });

    it('rejects non-student roles', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await expect(
        service.getStudentRequest(a.requestId, { id: 'user-1', role: ROLES.ADMIN } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('student view exposes options but never flags the correct code or partner internals', async () => {
      const a: any = await service.createRequest(dto(), partner);
      const view: any = await service.getStudentRequest(a.requestId, studentUser);
      expect(view.matchOptions).toHaveLength(3);
      expect(view.matchOptions).toContain(a.matchCode);
      expect(view).not.toHaveProperty('matchCode');
      expect(view).not.toHaveProperty('externalReference');
      expect(view.serverTime).toBeInstanceOf(Date);
    });
  });

  describe('approve / reject state machine', () => {
    it('approve is atomic and idempotent (double tap / two devices)', async () => {
      const a: any = await service.createRequest(dto(), partner);
      const results = await Promise.all([
        service.approveRequest(a.requestId, studentUser, { method: 'qr' }),
        service.approveRequest(a.requestId, studentUser, { method: 'qr' }),
        service.approveRequest(a.requestId, studentUser, { method: 'qr' }),
      ]);
      results.forEach((r: any) => expect(r.status).toBe('approved'));
      expect(prisma.rows[0].status).toBe('approved');
      const approvals = audit.logAction.mock.calls.filter((c) => c[0] === 'APPROVE_PARTNER_VERIFICATION');
      expect(approvals).toHaveLength(1);
    });

    it('approve and reject racing: exactly one wins and the terminal state never flips', async () => {
      const a: any = await service.createRequest(dto(), partner);
      const [approve, reject] = await Promise.allSettled([
        service.approveRequest(a.requestId, studentUser, { method: 'qr' }),
        service.rejectRequest(a.requestId, studentUser),
      ]);
      const fulfilled = [approve, reject].filter((r) => r.status === 'fulfilled');
      const rejected = [approve, reject].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);

      const winner = prisma.rows[0].status;
      await service.getPartnerRequest(a.requestId, partner);
      await service.getStudentRequest(a.requestId, studentUser);
      expect(prisma.rows[0].status).toBe(winner);
    });

    it('cannot change an approved request to rejected afterwards', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await service.approveRequest(a.requestId, studentUser, { method: 'qr' });
      await expect(service.rejectRequest(a.requestId, studentUser)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.rows[0].status).toBe('approved');
    });

    it('reject is idempotent', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await service.rejectRequest(a.requestId, studentUser);
      const again: any = await service.rejectRequest(a.requestId, studentUser);
      expect(again.status).toBe('rejected');
    });

    it('approve/reject after expiry returns 410 and persists expired', async () => {
      const a: any = await service.createRequest(dto(), partner);
      prisma.rows[0].expires_at = new Date(Date.now() - 1);
      await expect(service.approveRequest(a.requestId, studentUser, { method: 'qr' })).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(prisma.rows[0].status).toBe('expired');
      await expect(service.rejectRequest(a.requestId, studentUser)).rejects.toBeInstanceOf(GoneException);
    });

    it('a poll that sees a stale expired-looking row cannot overwrite an approval', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await service.approveRequest(a.requestId, studentUser, { method: 'qr' });
      prisma.rows[0].expires_at = new Date(Date.now() - 1000); // TTL boundary passed afterwards
      const view: any = await service.getPartnerRequest(a.requestId, partner);
      expect(view.status).toBe('approved');
      expect(prisma.rows[0].status).toBe('approved');
    });

    it('GET after expiry persists and reports expired', async () => {
      const a: any = await service.createRequest(dto(), partner);
      prisma.rows[0].expires_at = new Date(Date.now() - 1);
      const view: any = await service.getStudentRequest(a.requestId, studentUser);
      expect(view.status).toBe('expired');
      expect(view.matchOptions).toBeNull();
      expect(prisma.rows[0].status).toBe('expired');
    });
  });

  describe('number matching', () => {
    it('push path requires the correct code', async () => {
      const a: any = await service.createRequest(dto(), partner);
      const ok: any = await service.approveRequest(a.requestId, studentUser, { method: 'push', matchCode: a.matchCode });
      expect(ok.status).toBe('approved');
    });

    it('wrong code cancels the request (cannot be brute-forced)', async () => {
      const a: any = await service.createRequest(dto(), partner);
      const wrong = a.matchCode === '10' ? '11' : '10';
      await expect(
        service.approveRequest(a.requestId, studentUser, { method: 'push', matchCode: wrong }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.rows[0].status).toBe('rejected');
      await expect(
        service.approveRequest(a.requestId, studentUser, { method: 'push', matchCode: a.matchCode }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('missing code on the push path is treated as wrong', async () => {
      const a: any = await service.createRequest(dto(), partner);
      await expect(service.approveRequest(a.requestId, studentUser, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('options are stable, distinct, contain the code, and are sorted', () => {
      const first = buildMatchOptions('req-x', '42');
      expect(buildMatchOptions('req-x', '42')).toEqual(first);
      expect(new Set(first).size).toBe(3);
      expect(first).toContain('42');
      expect([...first].sort()).toEqual(first);
    });
  });

  describe('onModuleInit (partner key install)', () => {
    const strong = 'k'.repeat(48);

    it('deactivates the public placeholder key on boot', async () => {
      prisma.keys.push({ id: 'k0', partner_name: 'inside_karachi', hashed_key: PLACEHOLDER_PARTNER_KEY_HASH, is_active: true });
      await service.onModuleInit(); // no env configured
      expect(prisma.keys[0].is_active).toBe(false);
    });

    it('installs the configured key on first boot', async () => {
      config.get.mockReturnValue(strong);
      await service.onModuleInit();
      expect(prisma.keys).toHaveLength(1);
      expect(prisma.keys[0]).toMatchObject({ hashed_key: hashPartnerKey(strong), is_active: true });
    });

    it('rotation swaps the hash but does NOT re-activate a revoked key', async () => {
      prisma.keys.push({ id: 'k1', partner_name: 'inside_karachi', hashed_key: 'old', is_active: false });
      config.get.mockReturnValue(strong);
      await service.onModuleInit();
      expect(prisma.keys[0].hashed_key).toBe(hashPartnerKey(strong));
      expect(prisma.keys[0].is_active).toBe(false);
    });

    it('refuses a short key in production', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        config.get.mockReturnValue('short');
        await service.onModuleInit();
        expect(prisma.keys).toHaveLength(0);
      } finally {
        process.env.NODE_ENV = prev;
      }
    });
  });

  describe('recordDiscountRedemption', () => {
    const redemptionDto = (over: Row = {}) => ({
      verificationRequestId: 'req-1',
      externalReference: 'ik_order_98123',
      parchiId: '48219',
      discountAmountPkr: 1000,
      orderTotalPkr: 4500,
      ...over,
    });

    const addApprovedRequest = (over: Row = {}) => {
      prisma.rows.push({
        id: 'req-1',
        partner_id: 'partner-1',
        student_id: 'stu-1',
        status: 'approved',
        event_label: 'Show',
        ...over,
      });
    };

    it('creates a row for an approved verification', async () => {
      addStudent();
      addApprovedRequest();
      const result = await service.recordDiscountRedemption(redemptionDto(), partner);
      expect(result.created).toBe(true);
      expect(result.data).toMatchObject({
        verificationRequestId: 'req-1',
        externalReference: 'ik_order_98123',
        discountAmountPkr: 1000,
        orderTotalPkr: 4500,
        currency: 'PKR',
      });
      expect(audit.logCreate).toHaveBeenCalledWith(
        'CREATE_PARTNER_DISCOUNT_REDEMPTION',
        'partner_discount_redemptions',
        result.data.redemptionId,
        expect.objectContaining({ externalReference: 'ik_order_98123', discountAmountPkr: 1000 }),
      );
    });

    it('returns the existing row on the same externalReference (idempotent)', async () => {
      addStudent();
      addApprovedRequest();
      const first = await service.recordDiscountRedemption(redemptionDto(), partner);
      const second = await service.recordDiscountRedemption(
        redemptionDto({ discountAmountPkr: 50, orderTotalPkr: 1 }),
        partner,
      );
      expect(second.created).toBe(false);
      expect(second.data.redemptionId).toBe(first.data.redemptionId);
      expect(second.data.discountAmountPkr).toBe(1000);
      expect(prisma.discountRows).toHaveLength(1);
    });

    it('concurrent identical posts leave exactly one row', async () => {
      addStudent();
      addApprovedRequest();
      const [a, b] = await Promise.all([
        service.recordDiscountRedemption(redemptionDto(), partner),
        service.recordDiscountRedemption(redemptionDto(), partner),
      ]);
      expect([a.created, b.created].sort()).toEqual([false, true]);
      expect(a.data.redemptionId).toBe(b.data.redemptionId);
      expect(prisma.discountRows).toHaveLength(1);
    });

    it('409s when the same verification is reused with a different order id', async () => {
      addStudent();
      addApprovedRequest();
      await service.recordDiscountRedemption(redemptionDto(), partner);
      await expect(
        service.recordDiscountRedemption(redemptionDto({ externalReference: 'ik_order_other' }), partner),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.discountRows).toHaveLength(1);
    });

    it('409s when the same order is reused with a different verification', async () => {
      addStudent();
      addApprovedRequest();
      addApprovedRequest({ id: 'req-2' });
      await service.recordDiscountRedemption(redemptionDto(), partner);
      await expect(
        service.recordDiscountRedemption(redemptionDto({ verificationRequestId: 'req-2' }), partner),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.discountRows).toHaveLength(1);
    });

    it('409s when verification and order already belong to two different rows', async () => {
      addStudent();
      addApprovedRequest();
      addApprovedRequest({ id: 'req-2' });
      await service.recordDiscountRedemption(redemptionDto(), partner);
      await service.recordDiscountRedemption(
        redemptionDto({ verificationRequestId: 'req-2', externalReference: 'ik_order_other' }),
        partner,
      );
      await expect(
        service.recordDiscountRedemption(
          redemptionDto({ verificationRequestId: 'req-1', externalReference: 'ik_order_other' }),
          partner,
        ),
      ).rejects.toMatchObject({
        message: 'This verification and this order were already logged as separate checkouts',
      });
      expect(prisma.discountRows).toHaveLength(2);
    });

    it('rejects pending, rejected, and expired verifications', async () => {
      addStudent();
      for (const status of ['pending', 'rejected', 'expired']) {
        prisma.rows.length = 0;
        addApprovedRequest({ status });
        await expect(service.recordDiscountRedemption(redemptionDto(), partner)).rejects.toBeInstanceOf(
          ConflictException,
        );
      }
    });

    it('404s when the verification belongs to another partner', async () => {
      addStudent();
      addApprovedRequest({ partner_id: 'other-partner' });
      await expect(service.recordDiscountRedemption(redemptionDto(), partner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('400s when parchiId does not match the verification student', async () => {
      addStudent();
      addApprovedRequest();
      await expect(
        service.recordDiscountRedemption(redemptionDto({ parchiId: '99999' }), partner),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s an unknown verification id', async () => {
      addStudent();
      await expect(service.recordDiscountRedemption(redemptionDto(), partner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('GET returns the partner-scoped row and 404s others', async () => {
      addStudent();
      addApprovedRequest();
      const { data } = await service.recordDiscountRedemption(redemptionDto(), partner);
      const fetched = await service.getDiscountRedemption(data.redemptionId, partner);
      expect(fetched.redemptionId).toBe(data.redemptionId);
      await expect(
        service.getDiscountRedemption(data.redemptionId, { id: 'other-partner', partnerName: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
