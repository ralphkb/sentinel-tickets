const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { client, ticketsDB, ticketCategories } = require("../../init.js");
const {
  sanitizeInput,
  logMessage,
  checkSupportRole,
  configEmbed,
  getPermissionOverwrites,
  getChannel,
} = require("../../utils/mainUtils.js");

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
    let logChannel = await getChannel(logChannelId);
    const isEphemeral =
      config.addEmbed.ephemeral !== undefined
        ? config.addEmbed.ephemeral
        : false;

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
      await interaction.deferReply({ ephemeral: isEphemeral });

      let ticketButton = await ticketsDB.get(
        `${interaction.channel.id}.button`,
      );
      const category = ticketCategories[ticketButton];
      const usersPerms = category?.permissions?.addedUsers;
      const usersOpenPerms = await getPermissionOverwrites(usersPerms, "open", {
        allow: [
          "ViewChannel",
          "SendMessages",
          "EmbedLinks",
          "AttachFiles",
          "ReadMessageHistory",
        ],
        deny: [],
      });

      await interaction.channel.permissionOverwrites.create(
        user,
        usersOpenPerms,
      );

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

      await ticketsDB.push(`${interaction.channel.id}.addedUsers`, user.id);
      await interaction.editReply({
        embeds: [userAddEmbed],
        ephemeral: isEphemeral,
      });
      if (config.commands.add.pingUser) {
        await interaction.channel.send(`<@${user.id}>`);
      }
      if (config.toggleLogs.userAdd) {
        try {
          await logChannel.send({ embeds: [logUserAddEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
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
      await interaction.deferReply({ ephemeral: isEphemeral });

      let ticketButton = await ticketsDB.get(
        `${interaction.channel.id}.button`,
      );
      const category = ticketCategories[ticketButton];
      const rolesPerms = category?.permissions?.addedRoles;
      const rolesOpenPerms = await getPermissionOverwrites(rolesPerms, "open", {
        allow: [
          "ViewChannel",
          "SendMessages",
          "EmbedLinks",
          "AttachFiles",
          "ReadMessageHistory",
        ],
        deny: [],
      });

      await interaction.channel.permissionOverwrites.create(
        role,
        rolesOpenPerms,
      );

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
      await ticketsDB.push(`${interaction.channel.id}.addedRoles`, role.id);
      await interaction.editReply({
        embeds: [roleAddEmbed],
        ephemeral: isEphemeral,
      });
      if (config.toggleLogs.userAdd) {
        try {
          await logChannel.send({ embeds: [logRoleAddEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      logMessage(
        `${interaction.user.tag} added ${role.name} to the ticket #${interaction.channel.name} with reason ${reason}`,
      );
    }
  },
};
