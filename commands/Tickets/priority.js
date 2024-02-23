const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB, logMessage, checkSupportRole } = require("../../index.js");

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
        content: config.errors.not_in_a_ticket,
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content: config.errors.not_allowed,
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

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "add") {
      if (hasPriorityEmoji) {
        return interaction.reply({
          content: config.commands.priority.alreadyPriority,
          ephemeral: true,
        });
      }

      await interaction.deferReply();
      const option = interaction.options.getString("priority");
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
          return interaction.reply({
            content: "Invalid priority option",
            ephemeral: true,
          });
      }

      interaction.channel.setName(
        `${priorityEmoji}${interaction.channel.name}`,
      );

      const embedAdd = new EmbedBuilder()
        .setColor(config.commands.priority.embedAdd.color)
        .setDescription(
          `${config.commands.priority.embedAdd.description}`.replace(
            /\{priority\}/g,
            option,
          ),
        );
      await interaction.editReply({ embeds: [embedAdd] });
      logMessage(
        `${interaction.user.tag} updated the priority of the ticket #${interaction.channel.name} to ${option}.`,
      );
    }

    if (subcommand === "remove") {
      if (!hasPriorityEmoji) {
        return interaction.reply({
          content: config.commands.priority.notPriority,
          ephemeral: true,
        });
      }

      await interaction.deferReply();
      const channelName = interaction.channel.name;
      const updatedChannelName = priorityEmoji.reduce((acc, emoji) => {
        return acc.replace(emoji, "");
      }, channelName);

      interaction.channel.setName(updatedChannelName);
      const embedRemove = new EmbedBuilder()
        .setColor(config.commands.priority.embedRemove.color)
        .setDescription(`${config.commands.priority.embedRemove.description}`);
      await interaction.editReply({ embeds: [embedRemove] });
      logMessage(
        `${interaction.user.tag} removed the priority from the ticket #${interaction.channel.name}.`,
      );
    }
  },
};
