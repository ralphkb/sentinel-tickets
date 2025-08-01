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
  enabled: config.commands.rename.enabled,
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename a ticket.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Placeholders: {user}, {type}")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.rename.permission],
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
      config.renameEmbed.ephemeral !== undefined
        ? config.renameEmbed.ephemeral
        : false;

    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    let newName = interaction.options.getString("name");
    const ticketCreator = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    const ticketButton = await ticketsDB.get(
      `${interaction.channel.id}.button`,
    );
    const category = ticketCategories[ticketButton];
    newName = newName
      .replace(/\{user\}/g, ticketCreator.username)
      .replace(/\{type\}/g, category.name);
    await interaction.channel.setName(`${newName}`);
    let logChannelId = config.logs.ticketRename || config.logs.default;
    let logChannel = await getChannel(logChannelId);

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Logs | Ticket Renamed",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logRenameEmbed = await configEmbed(
      "logRenameEmbed",
      logDefaultValues,
    );

    logRenameEmbed.addFields([
      {
        name: config.logRenameEmbed.field_staff || "• Staff",
        value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logRenameEmbed.field_oldname || "• Ticket Old Name",
        value: `> #${sanitizeInput(interaction.channel.name)}`,
      },
      {
        name: config.logRenameEmbed.field_newname || "• Ticket New Name",
        value: `> ${interaction.channel}\n> #${sanitizeInput(newName)}`,
      },
    ]);

    const defaultValues = {
      color: "#2FF200",
      description: "This ticket has been renamed to **{name}**!",
    };

    const renameEmbed = await configEmbed("renameEmbed", defaultValues);

    if (renameEmbed.data && renameEmbed.data.description) {
      renameEmbed.setDescription(
        renameEmbed.data.description.replace(
          /\{name\}/g,
          sanitizeInput(newName),
        ),
      );
    }

    await interaction.editReply({
      embeds: [renameEmbed],
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    if (config.toggleLogs.ticketRename) {
      try {
        await logChannel.send({ embeds: [logRenameEmbed] });
      } catch (error) {
        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
        client.emit("error", error);
      }
    }
    await logMessage(
      `${interaction.user.tag} renamed the ticket #${interaction.channel.name} to #${newName}`,
    );
  },
};
