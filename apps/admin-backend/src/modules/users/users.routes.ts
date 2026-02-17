import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { changeUserRole, changeUserStatus, createUser, deleteUser, listUsers } from "./users.controller";
import { validateBody } from "../../common/middleware/validation";
import { changeUserRoleSchema, changeUserStatusSchema, createUserSchema } from "./users.schemas";

export const usersRouter = Router();

usersRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN"]));
usersRouter.get("/", listUsers);
usersRouter.post("/", validateBody(createUserSchema), createUser);
usersRouter.patch("/:id/role", validateBody(changeUserRoleSchema), changeUserRole);
usersRouter.patch("/:id/status", validateBody(changeUserStatusSchema), changeUserStatus);
usersRouter.delete("/:id", deleteUser);
