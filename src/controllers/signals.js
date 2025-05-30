const {
  addCandidateListner,
  clearCandidateQueue,
  addCandidate,
  getID,
} = require("./utils.js");
const kurento = require("kurento-client");

module.exports.sdpOffer = async (io, socket, message) => {
  const room = io.sockets.adapter.rooms.get(message.roomID);
  var offerBy = room.participants[getID(socket.id, message.role)];
  while (!offerBy) {
    offerBy = room.participants[getID(socket.id, message.role)];
  }
  const offerFor = room.participants[message.offerFor];
  console.log(message.offerFor);
  console.log(`SDP Offer from ${offerBy.id} for ${offerFor.id}`);
  if (offerBy.role !== "viewer") {
    while (!offerBy.outgoingMedia) {}
  }

  var incomingMedia;
  if (offerBy.id === offerFor.id) {
    incomingMedia = offerBy.outgoingMedia;
  } else {
    if (offerBy.incomingMedia[offerFor.id]) {
      incomingMedia = offerBy.incomingMedia[offerFor.id];
      offerFor.outgoingMedia.connect(incomingMedia);
    } else {
      console.log("here");
      incomingMedia = await room.pipeline.create("WebRtcEndpoint");
      console.log("here2");
      clearCandidateQueue(offerBy, offerFor.id, incomingMedia);
      addCandidateListner(socket, incomingMedia, offerFor.id);
      offerBy.incomingMedia[offerFor.id] = incomingMedia;
      offerFor.outgoingMedia.connect(incomingMedia);
    }
  }

  const sdpAnswer = await incomingMedia.processOffer(message.offer);
  socket.emit("signalling", {
    action: "sdpAnswer",
    senderID: offerFor.id,
    sdpAnswer: sdpAnswer,
  });
  console.log(`gathering candidates from ${offerBy.id} for ${offerFor.id}`);
  incomingMedia.gatherCandidates();
};

module.exports.candidate = (io, socket, message) => {
  const room = io.sockets.adapter.rooms.get(message.roomName);
  const user = room.participants[getID(socket.id, message.role)];

  const IceCandidate = kurento.register.complexTypes.IceCandidate(
    message.candidate
  );
  addCandidate(message.for, user, IceCandidate);
};
