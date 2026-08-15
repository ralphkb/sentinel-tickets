const { Events, ChannelType } = require("discord.js");
const { ticketsDB } = require("../init.js");

// Automatically removes ticket creators from staff threads if they are accidentally mentioned/added by staff
module.exports = {
  name: Events.ThreadMembersUpdate,
  async execute(addedMembers, _removedMembers, thread) {
    try {
      // Only process private threads
      if (thread.type !== ChannelType.PrivateThread) return;

      // Only process if members were added
      if (addedMembers.size === 0) return;

      // Find the parent ticket channel
      const parentChannelId = thread.parentId;
      if (!parentChannelId) return;

      // Check if this parent channel is a ticket
      const ticketData = await ticketsDB.get(parentChannelId);
      if (!ticketData) return;

      // Check if this thread is the staff notes thread for this ticket
      if (ticketData.staffThreadID !== thread.id) return;

      // Get the ticket creator ID
      const ticketCreatorId = ticketData.userID;
      if (!ticketCreatorId) return;

      // Check if the ticket creator was added to the thread
      for (const [memberId] of addedMembers) {
        if (memberId === ticketCreatorId) {
          // Automatically remove the ticket creator from the staff thread
          await thread.members.remove(memberId).catch((error) => {
            console.error(
              `Failed to remove ticket creator ${memberId} from staff thread ${thread.id}:`,
              error,
            );
          });

          if (!config.silentStartup) {
            console.log(
              `[ThreadMembersUpdate] Automatically removed ticket creator (${memberId}) from staff thread ${thread.name} (${thread.id})`,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `[ThreadMembersUpdate] Error processing thread members update:`,
        error,
      );
    }
  },
};
