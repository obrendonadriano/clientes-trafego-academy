import { authenticateMockUser } from "@/lib/mock-data";

export function authenticateUser(username: string, password: string) {
  return authenticateMockUser(username, password);
}
