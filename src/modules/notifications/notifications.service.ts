import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
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
    const firebaseConfigPath = this.configService.get<string>('FIREBASE_CONFIG_PATH');
    
    if (!firebaseConfigPath) {
      this.logger.warn('FIREBASE_CONFIG_PATH not set. Firebase notifications will not work.');
      return;
    }

    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(firebaseConfigPath),
        });
        this.logger.log('Firebase Admin initialized successfully');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin', error);
    }
  }

  async sendBroadcastNotification(createBroadcastDto: CreateBroadcastDto) {
    try {
      // 1. Save to Database
      const notification = await this.prisma.notifications.create({
        data: {
          title: createBroadcastDto.title,
          content: createBroadcastDto.content,
          image_url: createBroadcastDto.imageUrl,
          link_url: createBroadcastDto.linkUrl,
          type: 'broadcast',
        },
      });

      // 2. Define payload
      const message: admin.messaging.Message = {
        notification: {
          title: createBroadcastDto.title,
          body: createBroadcastDto.content,
          ...(createBroadcastDto.imageUrl && { imageUrl: createBroadcastDto.imageUrl }),
        },
        data: {
          notification_id: notification.id,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          ...(createBroadcastDto.linkUrl && { link_url: createBroadcastDto.linkUrl }),
        },
        topic: 'students_all',
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
}
