const { blacklistDB } = require("../init.js");

async function getNotes(userID) {
  return (await blacklistDB.get(`note-${userID}`)) || [];
}

async function addNote(userID, text, addedBy) {
  const notes = await getNotes(userID);
  notes.push({ text, addedBy, addedAt: Date.now() });
  await blacklistDB.set(`note-${userID}`, notes);
  return notes;
}

async function removeNote(userID, index) {
  const notes = await getNotes(userID);
  const zeroIndex = index - 1;
  if (zeroIndex < 0 || zeroIndex >= notes.length) {
    return { notes, removed: null };
  }
  const [removed] = notes.splice(zeroIndex, 1);
  if (notes.length === 0) {
    await blacklistDB.delete(`note-${userID}`);
  } else {
    await blacklistDB.set(`note-${userID}`, notes);
  }
  return { notes, removed };
}

module.exports = {
  getNotes,
  addNote,
  removeNote,
};
