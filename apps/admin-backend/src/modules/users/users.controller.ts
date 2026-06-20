import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { usersService } from "./users.service";

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await usersService.list();
  res.json({ items: users });
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.create(req.body);
  res.status(201).json(user);
});

export const changeUserRole = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.changeRole(String(req.params.id), req.body.role, req.auth?.userId);
  res.json(user);
});

export const changeUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.setActive(String(req.params.id), req.body.isActive, req.auth?.userId);
  res.json(user);
});

export const revokeUserSessions = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.revokeSessions(String(req.params.id), req.auth?.userId, {
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  });
  res.json(result);
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await usersService.remove(String(req.params.id), req.auth?.userId);
  res.status(204).send();
});
