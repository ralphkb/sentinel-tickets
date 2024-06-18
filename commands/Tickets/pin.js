const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB, client } = require("../../init.js");
const {
  logMessage,
  checkSupportRole,
  configEmbed,
  sanitizeInput,
  getChannel,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.pin.enabled,
  data: new SlashCommandBuilder()
    .setName("pin")
    .setDescription("Pin the ticket channel in the category.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.pin.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    if (interaction.channel.name.includes(config.commands.pin.emoji)) {
      return interaction.reply({
        content: config.commands.pin.alreadyPinned,
        ephemeral: true,
      });
    }
    const isEphemeral =
      config.pinEmbed.ephemeral !== undefined
        ? config.pinEmbed.ephemeral
        : false;
    await interaction.deferReply({ ephemeral: isEphemeral });

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
        name: config.logPinEmbed.field_staff,
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logPinEmbed.field_ticket,
        value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
      },
    ]);

    interaction.channel
      .setPosition(0)
      .then(() => {
        return new Promise((resolve) => setTimeout(resolve, 1000));
      })
      .then(() => {
        interaction.channel.setName(
          `${config.commands.pin.emoji}${interaction.channel.name}`,
        );
      });

    const defaultValues = {
      color: "#2FF200",
      description: "This ticket has been pinned.",
    };

    const pinEmbed = await configEmbed("pinEmbed", defaultValues);
    await interaction.editReply({ embeds: [pinEmbed], ephemeral: isEphemeral });
    if (config.toggleLogs.ticketPin) {
      try {
        await logChannel.send({ embeds: [logPinEmbed] });
      } catch (error) {
        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
        client.emit("error", error);
      }
    }
    logMessage(
      `${interaction.user.tag} pinned the ticket #${interaction.channel.name}`,
    );
  },
};
