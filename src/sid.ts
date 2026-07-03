export const SID_HEADER = "sid";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

export const SID_MISSING_MESSAGE =
  'MCP server connected without a valid sessionID. Add a header \'sid: <uuidv4>\' to this server\'s config, e.g. claude mcp add --transport http --header "sid: <uuidv4>" hbar http://localhost:7777/mcp';
