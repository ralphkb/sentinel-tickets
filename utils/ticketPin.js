const { MessageFlags } = require("discord.js");




const { client } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  getChannel,
} = require("./mainUtils.js");

async function pinTicket(interaction, pinEmoji, isEphemeral) {
  let logChannelId = config.logs.ticketPin || config.logs.default;
  let logChannel = await getChannel(logChannelId);

  const logDefaultValues = {
    color: "#2FF200",
    title: "Ticket Logs | Ticket Pinned",
    timestamp: true,
    thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logPinEmbed = await configEmbed("logPinEmbed", logDefaultValues);

  logPinEmbed.addFields([
    {
      name: config.logPinEmbed.field_staff || "• Staff",
      value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
    },
    {
      name: config.logPinEmbed.field_ticket || "• Ticket",
      value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
    },
  ]);

  await interaction.channel
    .setPosition(0)
    .then(() => {
      return new Promise((resolve) => setTimeout(resolve, 1000));
    })
    .then(async () => {
      await interaction.channel.setName(
        `${pinEmoji}${interaction.channel.name}`,
      );
    });

  const defaultValues = {
    color: "#2FF200",
    description: "This ticket has been pinned.",
  };

  const pinEmbed = await configEmbed("pinEmbed", defaultValues);
  await interaction.editReply({
    embeds: [pinEmbed],
    flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
  });
  if (config.toggleLogs.ticketPin) {
    try {
      await logChannel.send({ embeds: [logPinEmbed] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }
  await logMessage(
    `${interaction.user.tag} pinned the ticket #${interaction.channel.name}`,
  );
}

module.exports = {
  pinTicket,
};
