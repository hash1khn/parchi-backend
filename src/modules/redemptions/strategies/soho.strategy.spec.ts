import { Test, TestingModule } from '@nestjs/testing';
import { SohoStrategy } from './soho.strategy';
import { StrategyContext, StrategyResult } from './redemption-strategy.interface';

describe('SohoStrategy', () => {
  let strategy: SohoStrategy;
  let mockTx: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SohoStrategy],
    }).compile();

    strategy = module.get<SohoStrategy>(SohoStrategy);

    // Mock Prisma transaction client
    mockTx = {
      redemptions: {
        findMany: jest.fn(),
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createContext = (
    studentId: string = 'student-1',
    merchantId: string = 'merchant-1',
    offerId: string = 'offer-1',
  ): StrategyContext => ({
    studentId,
    merchantId,
    offerId,
    tx: mockTx,
  });

  const createRedemption = (daysAgo: number) => ({
    created_at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  });

  describe('calculateDiscount', () => {
    it('should return 20% for first visit (no previous redemptions)', async () => {
      // Arrange
      mockTx.redemptions.findMany.mockResolvedValue([]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 20,
        discountType: 'percentage',
        note: 'First Visit (or Streak Reset): 20% OFF',
      });
      expect(mockTx.redemptions.findMany).toHaveBeenCalledWith({
        where: {
          student_id: 'student-1',
          offers: {
            merchant_id: 'merchant-1',
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        take: 20,
        select: {
          created_at: true,
        },
      });
    });

    it('should return 30% for second visit (1 previous redemption within 10 days)', async () => {
      // Arrange
      const oneDayAgo = createRedemption(1);
      mockTx.redemptions.findMany.mockResolvedValue([oneDayAgo]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 30,
        discountType: 'percentage',
        note: 'Loyalty Bonus: 30% OFF',
      });
    });

    it('should return 40% for third visit (2 previous redemptions within 10 days)', async () => {
      // Arrange
      const oneDayAgo = createRedemption(1);
      const threeDaysAgo = createRedemption(3);
      mockTx.redemptions.findMany.mockResolvedValue([oneDayAgo, threeDaysAgo]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 40,
        discountType: 'percentage',
        note: 'Loyalty Streak: 40% OFF',
      });
    });

    it('should return 40% for fourth visit and beyond (3+ previous redemptions within 10 days)', async () => {
      // Arrange
      const oneDayAgo = createRedemption(1);
      const threeDaysAgo = createRedemption(3);
      const fiveDaysAgo = createRedemption(5);
      mockTx.redemptions.findMany.mockResolvedValue([
        oneDayAgo,
        threeDaysAgo,
        fiveDaysAgo,
      ]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 40,
        discountType: 'percentage',
        note: 'Loyalty Streak: 40% OFF',
      });
    });

    it('should break streak and return 20% when gap exceeds 10 days', async () => {
      // Arrange
      const elevenDaysAgo = createRedemption(11);
      mockTx.redemptions.findMany.mockResolvedValue([elevenDaysAgo]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 20,
        discountType: 'percentage',
        note: 'First Visit (or Streak Reset): 20% OFF',
      });
    });

    it('should maintain streak at exactly 10 days gap', async () => {
      // Arrange
      const tenDaysAgo = createRedemption(10);
      mockTx.redemptions.findMany.mockResolvedValue([tenDaysAgo]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 30,
        discountType: 'percentage',
        note: 'Loyalty Bonus: 30% OFF',
      });
    });

    it('should break streak when encountering a gap > 10 days in the middle', async () => {
      // Arrange
      // Recent redemption 2 days ago, but then 15 days ago (should break streak)
      const twoDaysAgo = createRedemption(2);
      const fifteenDaysAgo = createRedemption(15);
      mockTx.redemptions.findMany.mockResolvedValue([
        twoDaysAgo,
        fifteenDaysAgo,
      ]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      // Should only count the 2-day-ago redemption, so visitCount = 2 (streak=1 + current=1)
      expect(result).toEqual({
        discountValue: 30,
        discountType: 'percentage',
        note: 'Loyalty Bonus: 30% OFF',
      });
    });

    it('should handle same-day redemptions (0 days gap)', async () => {
      // Arrange
      const sameDay = createRedemption(0);
      mockTx.redemptions.findMany.mockResolvedValue([sameDay]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 30,
        discountType: 'percentage',
        note: 'Loyalty Bonus: 30% OFF',
      });
    });

    it('should ignore redemptions with null created_at', async () => {
      // Arrange
      const validRedemption = createRedemption(1);
      const invalidRedemption = { created_at: null };
      mockTx.redemptions.findMany.mockResolvedValue([
        validRedemption,
        invalidRedemption,
      ]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result).toEqual({
        discountValue: 30,
        discountType: 'percentage',
        note: 'Loyalty Bonus: 30% OFF',
      });
    });

    it('should handle multiple redemptions with varying gaps', async () => {
      // Arrange
      // 1 day, 3 days, 5 days, 7 days, 9 days ago - all within 10 days
      const redemptions = [1, 3, 5, 7, 9].map((days) => createRedemption(days));
      mockTx.redemptions.findMany.mockResolvedValue(redemptions);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      // visitCount = 5 (streak) + 1 (current) = 6, so should return 40%
      expect(result).toEqual({
        discountValue: 40,
        discountType: 'percentage',
        note: 'Loyalty Streak: 40% OFF',
      });
    });

    it('should handle complex scenario: recent streak with old redemptions', async () => {
      // Arrange
      // Recent streak: 1, 3, 5 days ago (within 10 days)
      // Old redemption: 20 days ago (should be ignored after streak break)
      const recent1 = createRedemption(1);
      const recent3 = createRedemption(3);
      const recent5 = createRedemption(5);
      const old20 = createRedemption(20);
      mockTx.redemptions.findMany.mockResolvedValue([
        recent1,
        recent3,
        recent5,
        old20,
      ]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      // Should count recent streak: 3 redemptions, so visitCount = 4
      expect(result).toEqual({
        discountValue: 40,
        discountType: 'percentage',
        note: 'Loyalty Streak: 40% OFF',
      });
    });

    it('should work with different student, merchant, and offer IDs', async () => {
      // Arrange
      mockTx.redemptions.findMany.mockResolvedValue([]);
      const context = createContext('student-999', 'merchant-888', 'offer-777');

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      expect(result.discountValue).toBe(20);
      expect(mockTx.redemptions.findMany).toHaveBeenCalledWith({
        where: {
          student_id: 'student-999',
          offers: {
            merchant_id: 'merchant-888',
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        take: 20,
        select: {
          created_at: true,
        },
      });
    });

    it('should handle maximum redemptions (20) correctly', async () => {
      // Arrange
      const manyRedemptions = Array.from({ length: 20 }, (_, i) =>
        createRedemption(i + 1),
      );
      mockTx.redemptions.findMany.mockResolvedValue(manyRedemptions);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      // All 20 are within 10 days, so visitCount = 21, should return 40%
      expect(result).toEqual({
        discountValue: 40,
        discountType: 'percentage',
        note: 'Loyalty Streak: 40% OFF',
      });
    });

    it('should handle edge case: redemption exactly 10.5 days ago (should break streak)', async () => {
      // Arrange
      // 10.5 days = 10 days and 12 hours
      const tenAndHalfDaysAgo = new Date(
        Date.now() - 10.5 * 24 * 60 * 60 * 1000,
      );
      mockTx.redemptions.findMany.mockResolvedValue([
        { created_at: tenAndHalfDaysAgo },
      ]);
      const context = createContext();

      // Act
      const result: StrategyResult = await strategy.calculateDiscount(context);

      // Assert
      // Math.ceil(10.5) = 11 days, which is > 10, so streak breaks
      expect(result).toEqual({
        discountValue: 20,
        discountType: 'percentage',
        note: 'First Visit (or Streak Reset): 20% OFF',
      });
    });
  });

  describe('Strategy Pattern Compliance', () => {
    it('should implement IRedemptionStrategy interface', () => {
      expect(strategy).toBeDefined();
      expect(typeof strategy.calculateDiscount).toBe('function');
    });

    it('should return StrategyResult with required fields', async () => {
      mockTx.redemptions.findMany.mockResolvedValue([]);
      const context = createContext();

      const result = await strategy.calculateDiscount(context);

      expect(result).toHaveProperty('discountValue');
      expect(result).toHaveProperty('discountType');
      expect(typeof result.discountValue).toBe('number');
      expect(['percentage', 'fixed']).toContain(result.discountType);
    });
  });
});
