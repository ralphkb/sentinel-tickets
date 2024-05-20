const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  client,
  ticketsDB,
  mainDB,
  ticketCategories,
  sanitizeInput,
  logMessage,
  checkSupportRole,
  configEmbed,
  getUser,
  findAvailableCategory,
  getRole,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.reopen.enabled,
  data: new SlashCommandBuilder()
    .setName("reopen")
    .setDescription("Re-Open a closed ticket.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.reopen.permission],
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

    if ((await ticketsDB.get(`${interaction.channel.id}.status`)) === "Open") {
      return interaction.reply({
        content: "This ticket is already open!",
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

    await interaction.deferReply();
    let ticketUserID = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    let ticketChannel = interaction.guild.channels.cache.get(
      interaction.channel.id,
    );
    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

    const logDefaultValues = {
      color: "#2FF200",
      title: "Ticket Logs | Ticket Re-Opened",
      timestamp: true,
      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const logReopenEmbed = await configEmbed(
      "logReopenEmbed",
      logDefaultValues,
    );

    logReopenEmbed.addFields([
      {
        name: config.logReopenEmbed.field_staff,
        value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
      },
      {
        name: config.logReopenEmbed.field_user,
        value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
      },
      {
        name: config.logReopenEmbed.field_ticket,
        value: `> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
      },
    ]);

    let logChannelId = config.logs.ticketReopen || config.logs.default;
    let logsChannel = interaction.guild.channels.cache.get(logChannelId);
    if (config.toggleLogs.ticketReopen) {
      await logsChannel.send({ embeds: [logReopenEmbed] });
    }

    const defaultValues = {
      color: "#2FF200",
      title: "Ticket Re-Opened",
      description: "This ticket has been re-opened by **{user} ({user.tag})**",
      timestamp: true,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const reopenEmbed = await configEmbed("reopenEmbed", defaultValues);

    if (reopenEmbed.data && reopenEmbed.data.description) {
      reopenEmbed.setDescription(
        reopenEmbed.data.description
          .replace(/\{user\}/g, `${interaction.user}`)
          .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)),
      );
    }

    const keepSupportPerms =
      config.keepSupportPerms !== undefined ? config.keepSupportPerms : false;

    Object.keys(ticketCategories).forEach(async (id) => {
      if (ticketButton === id) {
        const category = ticketCategories[id];
        const categoryIDs = category.categoryID;
        const categoryID = await findAvailableCategory(categoryIDs);

        if (
          !category.categoryID.some((catId) => catId === ticketChannel.parentId)
        ) {
          await ticketChannel.setParent(categoryID, {
            lockPermissions: false,
          });
        }

        if (!keepSupportPerms) {
          category.support_role_ids.forEach(async (roleId) => {
            await interaction.channel.permissionOverwrites.create(roleId, {
              ViewChannel: true,
              SendMessages: true,
              AttachFiles: true,
              EmbedLinks: true,
              ReadMessageHistory: true,
            });
          });
        }
      }
    });

    let claimUserID = await ticketsDB.get(
      `${interaction.channel.id}.claimUser`,
    );
    let claimUser;

    if (claimUserID) {
      claimUser = await getUser(claimUserID);
    }
    await interaction.channel.permissionOverwrites.create(ticketUserID.id, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
    });
    if (claimUser) {
      await interaction.channel.permissionOverwrites.create(claimUser.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });
    }

    const addedUsers =
      (await ticketsDB.get(`${interaction.channel.id}.addedUsers`)) || [];
    const addedRoles =
      (await ticketsDB.get(`${interaction.channel.id}.addedRoles`)) || [];
    const usersArray = await Promise.all(
      addedUsers.map(async (userId) => {
        return await getUser(userId);
      }),
    );
    const rolesArray = await Promise.all(
      addedRoles.map(async (roleId) => {
        return await getRole(roleId);
      }),
    );

    try {
      for (const member of usersArray) {
        await interaction.channel.permissionOverwrites.edit(member, {
          SendMessages: true,
          ViewChannel: true,
        });
      }
    } catch (error) {
      console.error(
        "An error occurred while editing permission overwrites on reopening a ticket:",
        error,
      );
    }

    try {
      for (const role of rolesArray) {
        await interaction.channel.permissionOverwrites.edit(role, {
          SendMessages: true,
          ViewChannel: true,
        });
      }
    } catch (error) {
      console.error(
        "An error occurred while editing permission overwrites on reopening a ticket:",
        error,
      );
    }

    await interaction.channel.messages
      .fetch(await ticketsDB.get(`${interaction.channel.id}.closeMsgID`))
      .then((msg) => msg.delete())
      .catch((error) => {
        console.error(
          `An error occurred while fetching and deleting the message in the ticket #${interaction.channel.name} while reopening it:`,
          error,
        );
      });
    await ticketsDB.set(`${interaction.channel.id}.status`, "Open");
    await mainDB.push("openTickets", interaction.channel.id);
    await interaction.editReply({ embeds: [reopenEmbed] });
    if (
      config.reopenDMEmbed.enabled &&
      interaction.user.id !== ticketUserID.id
    ) {
      const defaultDMValues = {
        color: "#2FF200",
        title: "Ticket Re-Opened",
        description:
          "Your ticket **#{ticketName}** has been reopened by {user} in **{server}**.",
      };

      const reopenDMEmbed = await configEmbed("reopenDMEmbed", defaultDMValues);

      if (reopenDMEmbed.data && reopenDMEmbed.data.description) {
        reopenDMEmbed.setDescription(
          reopenDMEmbed.data.description
            .replace(/\{ticketName\}/g, `${interaction.channel.name}`)
            .replace(/\{user\}/g, `<@!${interaction.user.id}>`)
            .replace(/\{server\}/g, `${interaction.guild.name}`),
        );
      }

      try {
        await ticketUserID.send({ embeds: [reopenDMEmbed] });
      } catch (error) {
        const defaultErrorValues = {
          color: "#FF0000",
          title: "DMs Disabled",
          description:
            "The bot could not DM **{user} ({user.tag})** because their DMs were closed.\nPlease enable `Allow Direct Messages` in this server to receive further information from the bot!\n\nFor help, please read [this article](https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings).",
          timestamp: true,
          thumbnail: `${ticketUserID.displayAvatarURL({ extension: "png", size: 1024 })}`,
          footer: {
            text: `${ticketUserID.tag}`,
            iconURL: `${ticketUserID.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const dmErrorEmbed = await configEmbed(
          "dmErrorEmbed",
          defaultErrorValues,
        );

        if (dmErrorEmbed.data && dmErrorEmbed.data.description) {
          dmErrorEmbed.setDescription(
            dmErrorEmbed.data.description
              .replace(/\{user\}/g, ticketUserID)
              .replace(/\{user\.tag\}/g, sanitizeInput(ticketUserID.tag)),
          );
        }

        let logChannelId = config.logs.DMErrors || config.logs.default;
        let logChannel = client.channels.cache.get(logChannelId);

        let dmErrorReply = {
          embeds: [dmErrorEmbed],
        };

        if (config.dmErrorEmbed.pingUser) {
          dmErrorReply.content = `<@${ticketUserID.id}>`;
        }

        if (config.toggleLogs.DMErrors) {
          await logChannel.send(dmErrorReply);
        }
        logMessage(
          `The bot could not DM ${ticketUserID.tag} because their DMs were closed`,
        );
      }
    }
    logMessage(
      `${interaction.user.tag} re-opened the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
    );
  },
};
