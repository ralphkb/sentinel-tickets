const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");




const { client, ticketsDB, ticketCategories } = require("../../init.js");
const {
  sanitizeInput,
  logMessage,
  checkSupportRole,
  configEmbed,
  getChannel,
  getUser,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.topic.enabled,
  data: new SlashCommandBuilder()
    .setName("topic")
    .setDescription("Change the topic of a ticket.")
    .addStringOption((option) =>
      option
        .setName("topic")
        .setDescription("Placeholders: {user}, {user.tag}, {type}")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.topic.permission],
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
    const isEphemeral =
      config.topicEmbed.ephemeral !== undefined
        ? config.topicEmbed.ephemeral
        : false;

    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    const oldTopic = interaction.channel.topic;
    let newTopic = interaction.options.getString("topic");
    const user = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    const ticketButton = await ticketsDB.get(
      `${interaction.channel.id}.button`,
    );
    const category = ticketCategories[ticketButton];
    newTopic = newTopic
      .replace(/\{user\}/g, user)
      .replace(/\{user\.tag\}/g, sanitizeInput(user.tag))
      .replace(/\{type\}/g, category.name);
    await interaction.channel.setTopic(newTopic);
    let logChannelId = config.logs.ticketTopic || config.logs.default;
    let logChannel = await getChannel(logChannelId);

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Logs | Ticket Topic Changed",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logTopicEmbed = await configEmbed("logTopicEmbed", logDefaultValues);

    logTopicEmbed.addFields([
      {
        name: config.logTopicEmbed.field_staff || "• Staff",
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logTopicEmbed.field_oldtopic || "• Ticket Old Topic",
        value: `> ${sanitizeInput(oldTopic)}`,
      },
      {
        name: config.logTopicEmbed.field_newtopic || "• Ticket New Topic",
        value: `> ${sanitizeInput(newTopic)}`,
      },
    ]);

    const defaultValues = {
      color: "#2FF200",
      description: "The topic of this ticket has been changed to **{topic}**",
    };

    const topicEmbed = await configEmbed("topicEmbed", defaultValues);

    if (topicEmbed.data && topicEmbed.data.description) {
      topicEmbed.setDescription(
        topicEmbed.data.description.replace(
          /\{topic\}/g,
          sanitizeInput(newTopic),
        ),
      );
    }

    await interaction.editReply({
      embeds: [topicEmbed],
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    if (config.toggleLogs.ticketTopic) {
      try {
        await logChannel.send({ embeds: [logTopicEmbed] });
      } catch (error) {
        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
        client.emit("error", error);
      }
    }
    await logMessage(
      `${interaction.user.tag} changed the topic of the ticket #${interaction.channel.name} to ${newTopic}`,
    );
  },
};
