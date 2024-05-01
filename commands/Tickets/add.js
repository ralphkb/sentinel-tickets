const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  ticketsDB,
  sanitizeInput,
  logMessage,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.add.enabled,
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user or role to a ticket channel.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Select a role").setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for adding the user or role")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.add.permission],
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

    let user = interaction.options.getUser("user");
    let role = interaction.options.getRole("role");
    let reason =
      interaction.options.getString("reason") || "No reason provided.";
    let logChannelId = config.logs.userAdd || config.logs.default;
    let logChannel = interaction.guild.channels.cache.get(logChannelId);

    if ((!user && !role) || (user && role)) {
      return interaction.reply({
        content: "Please provide either a user or a role, but not both.",
        ephemeral: true,
      });
    }

    if (user) {
      // Check that the user is already in the ticket channel
      if (interaction.channel.members.has(user.id)) {
        return interaction.reply({
          content: "That user is already in this ticket.",
          ephemeral: true,
        });
      }
      await interaction.deferReply();

      interaction.channel.permissionOverwrites.create(user, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });

      const logDefaultValues = {
        color: "#2FF200",
        title: "Ticket Logs | Target Added",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logUserAddEmbed = await configEmbed(
        "logAddEmbed",
        logDefaultValues,
      );

      logUserAddEmbed.addFields([
        {
          name: config.logAddEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logAddEmbed.field_target,
          value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
        },
        {
          name: config.logAddEmbed.field_ticket,
          value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
        },
        {
          name: config.logAddEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);

      const defaultValues = {
        color: "#2FF200",
        description:
          "Added **{target} ({target.tag})** to the ticket.\nReason: **{reason}**",
      };

      const userAddEmbed = await configEmbed("addEmbed", defaultValues);

      if (userAddEmbed.data && userAddEmbed.data.description) {
        userAddEmbed.setDescription(
          userAddEmbed.data.description
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag))
            .replace(/\{reason\}/g, reason),
        );
      }

      let userAddReply = {
        embeds: [userAddEmbed],
      };

      if (config.commands.add.pingUser) {
        userAddReply.content = `<@${user.id}>`;
      }

      await interaction.editReply(userAddReply);
      await logChannel.send({ embeds: [logUserAddEmbed] });
      logMessage(
        `${interaction.user.tag} added ${user.tag} to the ticket #${interaction.channel.name} with reason ${reason}`,
      );
    }

    if (role) {
      // Check that the role is already in the ticket channel
      if (interaction.channel.permissionsFor(role.id).has("ViewChannel")) {
        return interaction.reply({
          content: "That role is already in this ticket.",
          ephemeral: true,
        });
      }
      await interaction.deferReply();

      interaction.channel.permissionOverwrites.create(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });

      const logDefaultValues = {
        color: "#2FF200",
        title: "Ticket Logs | Target Added",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logRoleAddEmbed = await configEmbed(
        "logAddEmbed",
        logDefaultValues,
      );

      logRoleAddEmbed.addFields([
        {
          name: config.logAddEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logAddEmbed.field_target,
          value: `> ${role}\n> ${sanitizeInput(role.name)}`,
        },
        {
          name: config.logAddEmbed.field_ticket,
          value: `> ${interaction.channel}\n> #${sanitizeInput(interaction.channel.name)}`,
        },
        {
          name: config.logAddEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);

      const defaultValues = {
        color: "#2FF200",
        description:
          "Added **{target} ({target.tag})** to the ticket.\nReason: **{reason}**",
      };

      const roleAddEmbed = await configEmbed("addEmbed", defaultValues);

      if (roleAddEmbed.data && roleAddEmbed.data.description) {
        roleAddEmbed.setDescription(
          roleAddEmbed.data.description
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name))
            .replace(/\{reason\}/g, reason),
        );
      }
      await interaction.editReply({ embeds: [roleAddEmbed] });
      await logChannel.send({ embeds: [logRoleAddEmbed] });
      logMessage(
        `${interaction.user.tag} added ${role.name} to the ticket #${interaction.channel.name} with reason ${reason}`,
      );
    }
  },
};
