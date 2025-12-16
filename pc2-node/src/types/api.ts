/**
 * API Types
 * 
 * Type definitions for API requests and responses
 */

export interface APIError {
  error: string;
  message?: string;
  code?: string;
}

export interface AuthRequest {
  wallet_address: string;
  smart_account_address?: string;
  signature?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  uuid: string;
  username: string;
  wallet_address: string;
  smart_account_address: string | null;
  email: string | null;
  email_confirmed: boolean;
  is_temp: boolean;
  taskbar_items: any[];
  desktop_bg_url: string;
  desktop_bg_color: string | null;
  desktop_bg_fit: string;
  token: string;
  auth_type: 'wallet' | 'universalx';
}

export interface FileStat {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  created: number;
  modified: number;
  mime_type?: string | null;
  is_dir: boolean;
  uid?: string;
  uuid?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  created: number;
  modified: number;
  mime_type?: string | null;
  is_dir: boolean;
  uid?: string;
  uuid?: string;
}

export interface ReadFileRequest {
  path: string;
  encoding?: 'utf8' | 'base64';
}

export interface WriteFileRequest {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  mime_type?: string;
}

export interface CreateDirectoryRequest {
  path: string;
}

export interface DeleteRequest {
  items: Array<{ path: string } | { uid: string }>;
}

export interface MoveRequest {
  items: Array<{ path: string } | { uid: string }>;
  destination: string;
}

export interface SignRequest {
  items: Array<{ path?: string; uid?: string; action?: string }>;
  app_uid?: string;
}

export interface SignResponse {
  token: string;
  signatures: Array<{
    uid: string;
    expires: number;
    signature: string;
    url: string;
    read_url: string;
    write_url: string;
    metadata_url: string;
    fsentry_type: string;
    fsentry_is_dir: boolean;
    fsentry_name: string;
    fsentry_size: number;
    fsentry_accessed?: number;
    fsentry_modified: number;
    fsentry_created: number;
    path: string;
  }>;
}

