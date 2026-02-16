export interface AuthUser {
  id: string;
  email: string;
  organisationId: string;
  roles: string[];
  permissions: string[];
}
