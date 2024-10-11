const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB, ticketCategories } = require("../init.js");
const { configEmbed, sanitizeInput, logMessage } = require("./mainUtils.js");

async function closeRequestTicket(interaction, reason = "No reason provided.") {
  const ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

  const closeButton = new ButtonBuilder()
    .setCustomId("closeTicket")
    .setLabel(config.closeButton.label)
    .setEmoji(config.closeButton.emoji)
    .setStyle(ButtonStyle[config.closeButton.style]);

  const row = new ActionRowBuilder().addComponents(closeButton);

  const defaultValues = {
    color: "#FF2400",
    title: "Ticket Close Request",
    description:
      "**{user} ({user.tag})** has requested to have their ticket closed.\nReason: **{reason}**",
    timestamp: true,
    footer: {
      text: `${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const closeRequestEmbed = await configEmbed(
    "closeRequestEmbed",
    defaultValues,
  );

  if (closeRequestEmbed.data && closeRequestEmbed.data.description) {
    closeRequestEmbed.setDescription(
      closeRequestEmbed.data.description
        .replace(/\{user\}/g, `${interaction.user}`)
        .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag))
        .replace(/\{reason\}/g, reason),
    );
  }

  let requestReply = {
    embeds: [closeRequestEmbed],
    components: [row],
  };

  if (config.commands.closerequest.pingRoles) {
    const category = ticketCategories[ticketButton];
    const pingRoles = category.ping_role_ids.length > 0;
    const rolesToMention = pingRoles
      ? category.ping_role_ids.map((roleId) => `<@&${roleId}>`).join(" ")
      : "";
    requestReply.content = rolesToMention;
  }

  await interaction.editReply(requestReply);

  await logMessage(
    `${interaction.user.tag} requested their ticket #${interaction.channel.name} to be closed by staff for the reason: ${reason}`,
  );
}

module.exports = {
  closeRequestTicket,
};
