const asyncHandler = require("express-async-handler");
const { messageTemplateRepo } = require("../../repositories");

const listTemplates = asyncHandler(async (req, res) => {
  const templates = await messageTemplateRepo.findAll();
  res.json({ success: true, data: { templates } });
});

const createTemplate = asyncHandler(async (req, res) => {
  const { name, subject, body, channels } = req.body;

  if (await messageTemplateRepo.findByName(name)) {
    return res.status(409).json({ success: false, message: `A template named "${name}" already exists` });
  }

  const template = await messageTemplateRepo.create({
    name: name.trim(),
    subject: (subject || "").trim(),
    body,
    channels: channels || [],
    createdBy: req.user.id,
  });

  res.status(201).json({ success: true, message: "Template saved", data: { template } });
});

const updateTemplate = asyncHandler(async (req, res) => {
  const existing = await messageTemplateRepo.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Template not found" });
  }

  const { name, subject, body, channels } = req.body;

  if (name !== undefined) {
    const conflict = await messageTemplateRepo.findByName(name, existing.id);
    if (conflict) {
      return res.status(409).json({ success: false, message: `A template named "${name}" already exists` });
    }
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (subject !== undefined) updateData.subject = subject.trim();
  if (body !== undefined) updateData.body = body;
  if (channels !== undefined) updateData.channels = channels;

  const updated = await messageTemplateRepo.update(existing.id, updateData);
  res.json({ success: true, message: "Template updated", data: { template: updated } });
});

const deleteTemplate = asyncHandler(async (req, res) => {
  const existing = await messageTemplateRepo.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Template not found" });
  }

  await messageTemplateRepo.deleteById(existing.id);
  res.json({ success: true, message: "Template deleted" });
});

module.exports = { listTemplates, createTemplate, updateTemplate, deleteTemplate };
