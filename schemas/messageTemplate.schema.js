const z = require("zod");
const { id, requiredString, optionalString } = require("./fields");

const createTemplate = z.object({
  name: requiredString("Name", 150),
  subject: optionalString("Subject", 200),
  body: requiredString("Message", 2000),
  channels: z.array(z.enum(["email", "sms"])).max(2, "Too many channels").optional(),
});

const updateTemplate = createTemplate.partial();

const idParam = z.object({ id: id("Template id") });

module.exports = { createTemplate, updateTemplate, idParam };
