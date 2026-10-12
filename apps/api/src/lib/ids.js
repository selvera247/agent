import { randomUUID } from "node:crypto";

export function id(prefix = "") {
  const uuid = randomUUID().replace(/-/g, "");
  return prefix ? `${prefix}_${uuid.slice(0, 20)}` : uuid;
}
