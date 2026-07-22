const { ticketsDB, client, ticketCategories } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  moveTicketToCategory,
  getChannel,
} = require("./mainUtils.js");

async function pendingTicket(interaction) {
  const ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);
  const isPending = await ticketsDB.get(`${interaction.channel.id}.pending`);
  const category = ticketCategories[ticketButton];

  // Resolve the correct Discord category to move into/out of
  const pendingCategoryIDs =
    config.commands.pending.pendingCategoryID &&
    config.commands.pending.pendingCategoryID.length > 0
      ? config.commands.pending.pendingCategoryID
      : null;

  const activeCategoryIDs = category.categoryID;

  if (!pendingCategoryIDs) {
    return interaction.editReply({
      content:
        "No pending category has been configured. Please set `pendingCategoryID` under `commands.pending` in your config.",
    });
  }

  const logDefaultValues = {
    color: "#FFA500",
    title: isPending
      ? "Ticket Logs | Ticket Unset as Pending"
      : "Ticket Logs | Ticket Set as Pending",
    timestamp: true,
    thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logPendingEmbed = await configEmbed(
    "logPendingEmbed",
    logDefaultValues,
  );

  if (isPending) {
    // Un-pending: move back to the active open category
    const lockResult = await moveTicketToCategory(
      interaction.channel,
      activeCategoryIDs,
      {
        pending: false,
        lastMessageBy: "user",
        logTag: `${interaction.user.tag} moved the ticket #${interaction.channel.name} out of pending (back to active).`,
        onMissingCategory: async () => {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
              content:
                "Could not un-pend this ticket: all active ticket categories are full (50 channels each). Free up space and try again.",
            });
          }
        },
      },
    );

    if (lockResult === false) {
      return; // No available category; user already notified above
    }
    if (lockResult === null) {
      return interaction.editReply({
        content:
          "This ticket is currently being moved by another action. Please try again in a moment.",
      });
    }

    logPendingEmbed.addFields([
      {
        name: config.logPendingEmbed?.field_staff || "• Staff",
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logPendingEmbed?.field_ticket || "• Ticket",
        value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logPendingEmbed?.field_status || "• Status",
        value: `> Pending -> Active`,
      },
    ]);

    const unpendingDefaultValues = {
      color: "#2FF200",
      title: "Ticket Moved to Active",
      description:
        "This ticket has been moved back to the active queue by **{user}**.",
      timestamp: true,
      footer: {
        text: `Moved by ${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const unpendingEmbed = await configEmbed(
      "unpendingEmbed",
      unpendingDefaultValues,
    );

    if (unpendingEmbed.data && unpendingEmbed.data.description) {
      unpendingEmbed.setDescription(
        unpendingEmbed.data.description.replace(
          /\{user\}/g,
          `${interaction.user}`,
        ),
      );
    }

    await interaction.editReply({ embeds: [unpendingEmbed] });
  } else {
    // Set pending: move to the pending category
    const lockResult = await moveTicketToCategory(
      interaction.channel,
      pendingCategoryIDs,
      {
        pending: true,
        lastMessageBy: "staff",
        logTag: `${interaction.user.tag} set the ticket #${interaction.channel.name} as pending.`,
        onMissingCategory: async () => {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
              content:
                "Could not set this ticket as pending: all pending categories are full (50 channels each). Free up space and try again.",
            });
          }
        },
      },
    );

    if (lockResult === false) {
      return; // No available category; user already notified above
    }
    if (lockResult === null) {
      return interaction.editReply({
        content:
          "This ticket is currently being moved by another action. Please try again in a moment.",
      });
    }

    logPendingEmbed.addFields([
      {
        name: config.logPendingEmbed?.field_staff || "• Staff",
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logPendingEmbed?.field_ticket || "• Ticket",
        value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logPendingEmbed?.field_status || "• Status",
        value: `> Active -> Pending`,
      },
    ]);

    const pendingDefaultValues = {
      color: "#FFA500",
      title: "Ticket Set to Pending",
      description:
        "This ticket has been set to **pending** by **{user}**.\nIt has been moved to the pending queue until further action is taken.",
      timestamp: true,
      footer: {
        text: `Moved by ${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const pendingEmbed = await configEmbed(
      "pendingEmbed",
      pendingDefaultValues,
    );

    if (pendingEmbed.data && pendingEmbed.data.description) {
      pendingEmbed.setDescription(
        pendingEmbed.data.description.replace(
          /\{user\}/g,
          `${interaction.user}`,
        ),
      );
    }

    await interaction.editReply({ embeds: [pendingEmbed] });
  }

  const logChannelId = config.logs.ticketPending || config.logs.default;
  const logChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketPending) {
    try {
      await logChannel.send({ embeds: [logPendingEmbed] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }
}

module.exports = {
  pendingTicket,
};
