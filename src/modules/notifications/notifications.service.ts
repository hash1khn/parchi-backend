import { Injectable, OnModuleInit, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as admin from 'firebase-admin';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (admin.apps.length > 0) return; // Already initialized

    // Option 1 (Railway/production): FIREBASE_SERVICE_ACCOUNT_JSON env var (full JSON string)
    const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    // Option 2 (local dev): path to the JSON file
    const firebaseConfigPath = this.configService.get<string>('FIREBASE_CONFIG_PATH');

    if (!serviceAccountJson && !firebaseConfigPath) {
      this.logger.warn('Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_CONFIG_PATH is set. Firebase notifications will not work.');
      return;
    }

    try {
      if (serviceAccountJson) {
        // Parse the JSON string directly — ideal for Railway environment variables
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.logger.log('Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
      } else {
        admin.initializeApp({
          credential: admin.credential.cert(firebaseConfigPath!),
        });
        this.logger.log('Firebase Admin initialized from FIREBASE_CONFIG_PATH');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin', error);
    }
  }

  async sendBroadcastNotification(createBroadcastDto: CreateBroadcastDto) {
    try {
      const defaultImageUrl = 'https://zjghfwnrzazmukykgyhh.supabase.co/storage/v1/object/public/logo/parchi-app-icon.png';
      const imageUrl = createBroadcastDto.imageUrl || defaultImageUrl;
      
      // Determine target topic
      let targetTopic = 'students_all';
      if (createBroadcastDto.targetType === 'university' && createBroadcastDto.targetValue) {
        // Sanitize university name for topic (lowercase, no spaces)
        const sanitizedUni = createBroadcastDto.targetValue.toLowerCase().replace(/\s+/g, '_');
        targetTopic = `university_${sanitizedUni}`;
      } else if (createBroadcastDto.targetType === 'founders_club') {
        targetTopic = 'founders_club';
      }

      const notification = await this.prisma.notifications.create({
        data: {
          title: createBroadcastDto.title,
          content: createBroadcastDto.content,
          image_url: imageUrl,
          link_url: createBroadcastDto.linkUrl,
          type: (createBroadcastDto.targetType === 'all' || !createBroadcastDto.targetType) ? 'broadcast' : 'targeted',
        },
      });

      // 2. Define payload
      const message: admin.messaging.Message = {
        notification: {
          title: createBroadcastDto.title,
          body: createBroadcastDto.content,
          ...(imageUrl && { imageUrl }),
        },
        data: {
          notification_id: notification.id,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...(createBroadcastDto.linkUrl && { link_url: createBroadcastDto.linkUrl }),
        },
        topic: targetTopic,
      };

      // 3. Send via Firebase
      if (admin.apps.length > 0) {
        const response = await admin.messaging().send(message);
        this.logger.log(`Successfully sent broadcast message: ${response}`);
        return { success: true, messageId: response, notification };
      } else {
        this.logger.warn('Firebase app not initialized, skipping push notification');
        return { success: false, error: 'Firebase not initialized', notification };
      }
    } catch (error) {
      this.logger.error('Error sending broadcast notification:', error);
      throw error;
    }
  }

  async getNotificationQueue(status?: string) {
    try {
      const where: any = {};
      if (status) {
        where.status = status;
      }

      const queue = await this.prisma.notification_queue.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          users: {
            select: {
              email: true,
              role: true,
            },
          },
        },
      });

      return queue;
    } catch (error) {
      this.logger.error('Error fetching notification queue:', error);
      throw error;
    }
  }

  async getNotificationHistory(page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.prisma.notifications.findMany({
          skip,
          take: limit,
          orderBy: {
            created_at: 'desc',
          },
        }),
        this.prisma.notifications.count(),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          last_page: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching notification history:', error);
      throw error;
    }
  }


  async sendFromQueue(id: string) {
    try {
      // 1. Fetch queue item
      const queueItem = await this.prisma.notification_queue.findUnique({
        where: { id },
      });

      if (!queueItem) {
        throw new NotFoundException('Notification queue item not found');
      }

      if (queueItem.status === 'sent') {
        throw new BadRequestException('Notification has already been sent');
      }

      // 2. Save to Database (History)
      const notification = await this.prisma.notifications.create({
        data: {
          title: queueItem.title,
          content: queueItem.content,
          image_url: queueItem.image_url,
          link_url: queueItem.link_url,
          type: 'broadcast', // derived from queue, assumming broadcast for now
        },
      });

      // 3. Define payload
      const message: admin.messaging.Message = {
        notification: {
          title: queueItem.title,
          body: queueItem.content,
          ...(queueItem.image_url && { imageUrl: queueItem.image_url }),
        },
        data: {
          notification_id: notification.id,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...(queueItem.link_url && { link_url: queueItem.link_url }),
        },
        topic: queueItem.target_topic || 'students_all',
      };

      // 4. Send via Firebase
      if (admin.apps.length > 0) {
        const response = await admin.messaging().send(message);
        this.logger.log(`Successfully sent queue notification ${id}: ${response}`);

        // 5. Update Queue Status
        await this.prisma.notification_queue.update({
          where: { id },
          data: {
            status: 'sent',
            updated_at: new Date(),
          },
        });

        return { success: true, messageId: response, notification };
      } else {
        this.logger.warn('Firebase app not initialized, skipping push notification');
        return { success: false, error: 'Firebase not initialized', notification };
      }
    } catch (error) {
      this.logger.error(`Error sending notification from queue ${id}:`, error);
      throw error;
    }
  }

  async getStudentNotifications(userId: string, page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      // Fetch the user's created_at so we can exclude broadcasts that predate their signup.
      // This prevents new users from seeing notifications that were meant for existing users.
      const user = await this.prisma.public_users.findUnique({
        where: { id: userId },
        select: { created_at: true },
      });

      const userCreatedAt = user?.created_at ?? new Date(0);

      // Fetch notifications with read status for this user.
      // Broadcast notifications are filtered to only those created AFTER the user signed up.
      // Personal notifications targeted at this user are always included.
      const whereCondition = {
        OR: [
          {
            type: 'broadcast',
            created_at: { gte: userCreatedAt }, // only broadcasts after user signup
          },
          { target_user_id: userId },
        ],
      };

      const [notifications, total] = await Promise.all([
        this.prisma.notifications.findMany({
          where: whereCondition,
          skip,
          take: limit,
          orderBy: {
            created_at: 'desc',
          },
          include: {
            user_notification_reads: {
              where: {
                user_id: userId,
              },
              select: {
                read_at: true,
              },
            },
          },
        }),
        this.prisma.notifications.count({ where: whereCondition }),
      ]);

      // Transform raw result to add is_read flag
      const data = notifications.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        imageUrl: n.image_url,
        linkUrl: n.link_url,
        type: n.type,
        createdAt: n.created_at,
        isRead: n.user_notification_reads.length > 0,
      }));

      return {
        data,
        meta: {
          total,
          page,
          last_page: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching student notifications:', error);
      throw error;
    }
  }

  async markAsRead(userId: string, notificationId: string) {
    try {
      // Check if notification exists
      const notification = await this.prisma.notifications.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new NotFoundException('Notification not found');
      }

      // Check if already read
      const existingRead = await this.prisma.user_notification_reads.findUnique({
        where: {
          notification_id_user_id: {
            notification_id: notificationId,
            user_id: userId,
          },
        },
      });

      if (existingRead) {
        return { message: 'Notification already marked as read' };
      }

      // Mark as read
      await this.prisma.user_notification_reads.create({
        data: {
          user_id: userId,
          notification_id: notificationId,
        },
      });

      return { message: 'Notification marked as read' };
    } catch (error) {
      this.logger.error(`Error marking notification ${notificationId} as read for user ${userId}:`, error);
      throw error;
    }
  }
  async sendPersonalNotification(
  userId: string,
  title: string,
  content: string,
  imageUrl?: string,
  linkUrl?: string,
) {
  try {
    // 1. Get all FCM tokens for this user (multi-device support)
    const userExists = await this.prisma.public_users.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      throw new NotFoundException('User not found');
    }

    const fcmTokenRows = await (this.prisma as any).user_fcm_tokens.findMany({
      where: { user_id: userId },
      select: { token: true },
    });

    // 2. Save notification to database
    const notification = await this.prisma.notifications.create({
      data: {
        title,
        content,
        image_url: imageUrl,
        link_url: linkUrl,
        type: 'personal',
        target_user_id: userId,
      },
    });

    // 3. Send via Firebase to all registered devices
    const tokens: string[] = fcmTokenRows.map((r: { token: string }) => r.token);

    if (tokens.length > 0 && admin.apps.length > 0) {
      const basePayload = {
        notification: {
          title,
          body: content,
          ...(imageUrl && { imageUrl }),
        },
        android: {
          notification: {
            sound: 'default',
            channelId: 'broadcast_channel',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default' },
          },
        },
        data: {
          notification_id: String(notification.id),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...(linkUrl && { link_url: linkUrl }),
          type: 'personal',
        },
      };

      const multicastMessage: admin.messaging.MulticastMessage = {
        ...basePayload,
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(multicastMessage);

      // Clean up any tokens that are no longer valid
      const invalidTokens: string[] = [];
      response.responses.forEach((r, idx) => {
        if (!r.success && (
          r.error?.code === 'messaging/registration-token-not-registered' ||
          r.error?.code === 'messaging/invalid-registration-token'
        )) {
          invalidTokens.push(tokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await (this.prisma as any).user_fcm_tokens.deleteMany({
          where: { user_id: userId, token: { in: invalidTokens } },
        });
        this.logger.log(`Removed ${invalidTokens.length} stale FCM token(s) for user ${userId}`);
      }

      this.logger.log(
        `Personal notification to ${userId}: ${response.successCount}/${tokens.length} devices reached`
      );

      return { success: true, successCount: response.successCount, notification };
    }

    return {
      success: true,
      notification,
      message: 'Notification saved, but not sent (no tokens or firebase not init)',
    };
  } catch (error) {
    this.logger.error(
      `Error sending personal notification to ${userId}:`,
      error
    );

    return { success: false, error: error.message };
  }
}

  async hasUnread(userId: string): Promise<boolean> {
    try {
      // Logic:
      // Count notifications where:
      // 1. (type = 'broadcast' AND created_after_user_signup) OR target_user_id = userId
      // 2. AND NOT EXISTS in user_notification_reads for this userId

      const user = await this.prisma.public_users.findUnique({
        where: { id: userId },
        select: { created_at: true },
      });

      const userCreatedAt = user?.created_at ?? new Date(0);

      const unreadCount = await this.prisma.notifications.count({
        where: {
          AND: [
            {
              OR: [
                {
                  type: 'broadcast',
                  created_at: { gte: userCreatedAt },
                },
                { target_user_id: userId },
              ],
            },
            {
              user_notification_reads: {
                none: {
                  user_id: userId,
                },
              },
            },
          ],
        },
      });

      return unreadCount > 0;
    } catch (error) {
      this.logger.error(`Error checking unread notifications for ${userId}:`, error);
      return false; // Default to false on error to avoid blocking UI
    }
  }

  async getTargetGroups() {
    try {
      const universities = await this.prisma.students.findMany({
        where: {
          university: {
            not: '',
          },
        },
        distinct: ['university'],
        select: {
          university: true,
        },
        orderBy: {
          university: 'asc'
        }
      });

      return {
        universities: universities.map((u) => u.university).filter(Boolean),
        groups: ['Founders Club'],
      };
    } catch (error) {
      this.logger.error('Error fetching target groups:', error);
      throw error;
    }
  }
}
