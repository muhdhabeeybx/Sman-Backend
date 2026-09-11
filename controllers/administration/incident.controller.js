const asyncHandler = require("express-async-handler");
const { incidentRecordRepo } = require("../../repositories");
const incidentService = require("../../services/incident.service");
const { sendServiceResult } = require("../../utils/serviceResult");
const { staffActor } = require("../../utils/actor");

const getIncidents = asyncHandler(async (req, res) => {
  const result = await incidentRecordRepo.findAll({ ...req.query, scopeUser: req.user });
  res.json({ success: true, data: result });
});

const getIncidentById = asyncHandler(async (req, res) => {
  const record = await incidentRecordRepo.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: "Record not found" });
  }
  res.json({ success: true, data: { record } });
});

const submitIncident = asyncHandler(async (req, res) => {
  const result = await incidentService.submitIncident(req.body, { actor: staffActor(req) });
  sendServiceResult(res, result, { successStatus: 201, message: "Record submitted" });
});

const transitionIncident = asyncHandler(async (req, res) => {
  const result = await incidentService.transitionIncident(req.params.id, req.body, {
    actor: staffActor(req),
  });
  sendServiceResult(res, result, { message: `Record ${req.body.status}` });
});

module.exports = { getIncidents, getIncidentById, submitIncident, transitionIncident };
