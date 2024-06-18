const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { client, ticketsDB } = require("../../init.js");
const {
  logMessage,
  checkSupportRole,
  configEmbed,
  sanitizeInput,
  getChannel,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.priority.enabled,
  data: new SlashCommandBuilder()
    .setName("priority")
    .setDescription("Manage ticket priority.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a priority to a ticket.")
        .addStringOption((option) =>
          option
            .setName("priority")
            .setDescription("Select a priority")
            .setRequired(true)
            .addChoices(
              { name: "Low", value: "low" },
              { name: "Medium", value: "medium" },
              { name: "High", value: "high" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("The reason for adding the priority")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove the priority from a ticket."),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.priority.permission],
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

    const emojiLow = config.commands.priority.emojis.low;
    const emojiMedium = config.commands.priority.emojis.medium;
    const emojiHigh = config.commands.priority.emojis.high;
    const priorityEmoji = [emojiLow, emojiMedium, emojiHigh];

    const hasPriorityEmoji = priorityEmoji.some((emoji) =>
      interaction.channel.name.includes(emoji),
    );

    let logChannelId = config.logs.ticketPriority || config.logs.default;
    let logChannel = await getChannel(logChannelId);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "add") {
      if (hasPriorityEmoji) {
        return interaction.reply({
          content: config.commands.priority.alreadyPriority,
          ephemeral: true,
        });
      }
      const isEphemeral =
        config.priorityAddEmbed.ephemeral !== undefined
          ? config.priorityAddEmbed.ephemeral
          : false;

      await interaction.deferReply({ ephemeral: isEphemeral });
      const option = interaction.options.getString("priority");
      let reason =
        interaction.options.getString("reason") || "No reason provided.";
      let priorityEmoji;
      switch (option) {
        case "low":
          priorityEmoji = emojiLow;
          break;
        case "medium":
          priorityEmoji = emojiMedium;
          break;
        case "high":
          priorityEmoji = emojiHigh;
          break;
        default:
          return interaction.editReply({
            content: "Invalid priority option",
            ephemeral: isEphemeral,
          });
      }

      const logDefaultValues = {
        color: "#2FF200",
        title: "Ticket Logs | Ticket Priority Added",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logPriorityAddEmbed = await configEmbed(
        "logPriorityAddEmbed",
        logDefaultValues,
      );

      logPriorityAddEmbed.addFields([
        {
          name: config.logPriorityAddEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logPriorityAddEmbed.field_ticket,
          value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
        },
        {
          name: config.logPriorityAddEmbed.field_priority,
          value: `> ${priorityEmoji} ${option}`,
        },
        {
          name: config.logPriorityAddEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);

      interaction.channel.setName(
        `${priorityEmoji}${interaction.channel.name}`,
      );

      const defaultValues = {
        color: "#2FF200",
        description:
          "The priority of this ticket has been set to **{priority}**.\nReason: **{reason}**",
      };

      const priorityAddEmbed = await configEmbed(
        "priorityAddEmbed",
        defaultValues,
      );

      if (priorityAddEmbed.data && priorityAddEmbed.data.description) {
        priorityAddEmbed.setDescription(
          priorityAddEmbed.data.description
            .replace(/\{priority\}/g, option)
            .replace(/\{reason\}/g, reason),
        );
      }

      await interaction.editReply({
        embeds: [priorityAddEmbed],
        ephemeral: isEphemeral,
      });
      if (config.toggleLogs.ticketPriority) {
        try {
          await logChannel.send({ embeds: [logPriorityAddEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      logMessage(
        `${interaction.user.tag} updated the priority of the ticket #${interaction.channel.name} to ${option} with reason ${reason}.`,
      );
    }

    if (subcommand === "remove") {
      if (!hasPriorityEmoji) {
        return interaction.reply({
          content: config.commands.priority.notPriority,
          ephemeral: true,
        });
      }
      const isEphemeral =
        config.priorityRemoveEmbed.ephemeral !== undefined
          ? config.priorityRemoveEmbed.ephemeral
          : false;

      await interaction.deferReply({ ephemeral: isEphemeral });
      const channelName = interaction.channel.name;
      const updatedChannelName = priorityEmoji.reduce((acc, emoji) => {
        return acc.replace(emoji, "");
      }, channelName);

      interaction.channel.setName(updatedChannelName);

      const logDefaultValues = {
        color: "#2FF200",
        title: "Ticket Logs | Ticket Priority Removed",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logPriorityRemoveEmbed = await configEmbed(
        "logPriorityRemoveEmbed",
        logDefaultValues,
      );

      logPriorityRemoveEmbed.addFields([
        {
          name: config.logPriorityRemoveEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logPriorityRemoveEmbed.field_ticket,
          value: `> #${sanitizeInput(channelName)} -> #${sanitizeInput(updatedChannelName)}`,
        },
      ]);

      const defaultValues = {
        color: "FF2400",
        description: "The priority of this ticket has been removed.",
      };

      const priorityRemoveEmbed = await configEmbed(
        "priorityRemoveEmbed",
        defaultValues,
      );

      await interaction.editReply({
        embeds: [priorityRemoveEmbed],
        ephemeral: isEphemeral,
      });
      if (config.toggleLogs.ticketPriority) {
        try {
          await logChannel.send({ embeds: [logPriorityRemoveEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      logMessage(
        `${interaction.user.tag} removed the priority from the ticket #${interaction.channel.name}.`,
      );
    }
  },
};
