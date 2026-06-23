import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

// Multer aborts the upload stream and throws before the controller body runs,
// so these errors bypass any try/catch in the route handler — they need their
// own filter to avoid surfacing raw Multer error codes to the client.
const FRIENDLY_MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'One of your uploaded images is too large. Please use a photo under 10MB.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file received. Please upload only the requested documents.',
  LIMIT_FILE_COUNT: 'Too many files uploaded for one of the document fields.',
};

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message:
        FRIENDLY_MULTER_MESSAGES[exception.code] ||
        'Failed to upload one of your files. Please try again.',
      error: 'Bad Request',
    });
  }
}
