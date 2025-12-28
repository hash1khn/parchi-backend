import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'audit';

export interface AuditMetadata {
  action: string;
  tableName?: string;
  recordIdParam?: string; // Parameter name that contains the record ID (e.g., 'id', 'merchantId')
  getRecordId?: (args: any[]) => string; // Function to extract record ID from method arguments
  getOldValues?: (args: any[]) => any; // Function to get old values before update
  getNewValues?: (args: any[]) => any; // Function to get new values from request
  skipLogging?: boolean; // Skip logging for this operation
}

/**
 * Decorator to mark a method for audit logging
 * @param metadata Audit metadata configuration
 */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, metadata);

