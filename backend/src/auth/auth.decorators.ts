import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "../generated/prisma/client";

export const PUBLIC_ROUTE_KEY = "auth:public";
export const REQUIRED_ROLES_KEY = "auth:roles";

export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);

export const Roles = (...roles: UserRole[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);