const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { client, ticketsDB } = require("../../init.js");
const {
  logMessage,
  formatTime,
  checkSupportRole,
  configEmbed,
  sanitizeInput,
  getChannel,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.slowmode.enabled,
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Add slowmode to a ticket channel.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.slowmode.permission],
    )
    .addIntegerOption((option) =>
      option
        .setName("time")
        .setDescription("Input a time in seconds")
        .setRequired(true)
        .setMaxValue(21600),
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const time = interaction.options.getInteger("time");
    if (time < 0) {
      return interaction.reply({
        content: "The specified time must be a positive number.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const currentSlowmode = interaction.channel.rateLimitPerUser;

    if (currentSlowmode === time) {
      return interaction.reply({
        content:
          config.commands.slowmode.alreadySlowmode ||
          "This ticket channel already has that slowmode.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (time === 0) {
      await interaction.channel.setRateLimitPerUser(0);
      return interaction.reply({
        content:
          config.commands.slowmode.slowmodeRemoved ||
          "The slowmode has been removed from this ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const isEphemeral =
      config.slowmodeEmbed.ephemeral !== undefined
        ? config.slowmodeEmbed.ephemeral
        : false;

    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    await interaction.channel.setRateLimitPerUser(time);
    const formattedTime = formatTime(time);

    let logChannelId = config.logs.ticketSlowmode || config.logs.default;
    let logChannel = await getChannel(logChannelId);

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Logs | Ticket Slowmode",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logSlowmodeEmbed = await configEmbed(
      "logSlowmodeEmbed",
      logDefaultValues,
    );

    logSlowmodeEmbed.addFields([
      {
        name: config.logSlowmodeEmbed.field_staff || "• Staff",
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logSlowmodeEmbed.field_ticket || "• Ticket",
        value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logSlowmodeEmbed.field_slowmode || "• Slowmode",
        value: `> **${formatTime(currentSlowmode)}** -> **${formattedTime}**`,
      },
    ]);

    const defaultValues = {
      color: "#2FF200",
      description: "A slowmode of **{time}** has been added to this ticket.",
    };

    const slowmodeEmbed = await configEmbed("slowmodeEmbed", defaultValues);

    if (slowmodeEmbed.data && slowmodeEmbed.data.description) {
      slowmodeEmbed.setDescription(
        slowmodeEmbed.data.description.replace(/\{time\}/g, formattedTime),
      );
    }
    await interaction.editReply({
      embeds: [slowmodeEmbed],
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    if (config.toggleLogs.ticketSlowmode) {
      try {
        await logChannel.send({ embeds: [logSlowmodeEmbed] });
      } catch (error) {
        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
        client.emit("error", error);
      }
    }
    await logMessage(
      `${interaction.user.tag} added a slow mode of ${formattedTime} to the ticket #${interaction.channel.name}`,
    );
  },
};
