export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  name: string;
  credits: number;
  created_at: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  credits: number;
};