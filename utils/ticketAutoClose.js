const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const dotenv = require("dotenv");
dotenv.config();
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { mainDB, ticketsDB, client, ticketCategories } = require("../init.js");
const {
  configEmbed,
  getUser,
  sanitizeInput,
  logMessage,
  findAvailableCategory,
  getPermissionOverwrites,
  getUserPreference,
  getChannel,
  getRole,
} = require("./mainUtils.js");

async function autoCloseTicket(channelID, creatorLeft = false) {
  const ticketChannel = await getChannel(channelID);
  await ticketsDB.set(`${channelID}.closeUserID`, "Automation");
  const ticketUserID = await getUser(
    await ticketsDB.get(`${channelID}.userID`),
  );
  const claimUserID = await ticketsDB.get(`${channelID}.claimUser`);
  let claimUser;
  if (claimUserID) {
    claimUser = await getUser(claimUserID);
  }
  const ticketType = await ticketsDB.get(`${channelID}.ticketType`);
  const ticketButton = await ticketsDB.get(`${channelID}.button`);

  const logDefaultValues = {
    color: "#FF2400",
    title: "Ticket Logs | Ticket Closed",
    timestamp: true,
    thumbnail: `${client.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${client.user.tag}`,
      iconURL: `${client.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logCloseEmbed = await configEmbed("logCloseEmbed", logDefaultValues);

  logCloseEmbed.addFields([
    {
      name: config.logCloseEmbed.field_staff,
      value: `> <@!${client.user.id}>\n> ${sanitizeInput(client.user.tag)}`,
    },
    {
      name: config.logCloseEmbed.field_user,
      value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
    },
    {
      name: config.logCloseEmbed.field_ticket,
      value: `> #${sanitizeInput(ticketChannel.name)}\n> ${ticketType}`,
    },
  ]);

  if (claimUser) {
    logCloseEmbed.addFields({
      name: "• Claimed By",
      value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
    });
  }

  let row = new ActionRowBuilder();
  if (config.closeEmbed.useMenu) {
    const options = [];

    if (config.closeEmbed.reOpenButton !== false) {
      const reopenOption = new StringSelectMenuOptionBuilder()
        .setLabel(config.reOpenButton.label)
        .setDescription(config.closeEmbed.reopenDescription)
        .setValue("reOpen")
        .setEmoji(config.reOpenButton.emoji);
      options.push(reopenOption);
    }

    if (config.closeEmbed.transcriptButton !== false) {
      const transcriptOption = new StringSelectMenuOptionBuilder()
        .setLabel(config.transcriptButton.label)
        .setDescription(config.closeEmbed.transcriptDescription)
        .setValue("createTranscript")
        .setEmoji(config.transcriptButton.emoji);
      options.push(transcriptOption);
    }

    if (config.closeEmbed.deleteButton !== false) {
      const deleteOption = new StringSelectMenuOptionBuilder()
        .setLabel(config.deleteButton.label)
        .setDescription(config.closeEmbed.deleteDescription)
        .setValue("deleteTicket")
        .setEmoji(config.deleteButton.emoji);
      options.push(deleteOption);
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("closeMenu")
      .setPlaceholder(config.closeEmbed.menuPlaceholder || "Select an option")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    if (selectMenu.options.length > 0) {
      row.addComponents(selectMenu);
      await mainDB.set("closeMenuOptions", {
        options,
        placeholder: config.closeEmbed.menuPlaceholder || "Select an option",
      });
    }
  } else {
    const reOpenButton =
      config.closeEmbed.reOpenButton !== false
        ? new ButtonBuilder()
            .setCustomId("reOpen")
            .setLabel(config.reOpenButton.label)
            .setEmoji(config.reOpenButton.emoji)
            .setStyle(ButtonStyle[config.reOpenButton.style])
        : null;

    const transcriptButton =
      config.closeEmbed.transcriptButton !== false
        ? new ButtonBuilder()
            .setCustomId("createTranscript")
            .setLabel(config.transcriptButton.label)
            .setEmoji(config.transcriptButton.emoji)
            .setStyle(ButtonStyle[config.transcriptButton.style])
        : null;

    const deleteButton =
      config.closeEmbed.deleteButton !== false
        ? new ButtonBuilder()
            .setCustomId("deleteTicket")
            .setLabel(config.deleteButton.label)
            .setEmoji(config.deleteButton.emoji)
            .setStyle(ButtonStyle[config.deleteButton.style])
        : null;

    if (reOpenButton) row.addComponents(reOpenButton);
    if (transcriptButton) row.addComponents(transcriptButton);
    if (deleteButton) row.addComponents(deleteButton);
  }

  const defaultValues = {
    color: "#FF2400",
    title: "Ticket Automatically Closed",
    description:
      "This ticket was automatically closed by **{user} ({user.tag})**",
    timestamp: true,
    footer: {
      text: `${client.user.tag}`,
      iconURL: `${client.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const closeEmbed = await configEmbed("autoCloseEmbed", defaultValues);

  if (closeEmbed.data && closeEmbed.data.description) {
    closeEmbed.setDescription(
      closeEmbed.data.description
        .replace(/\{user\}/g, `${client.user}`)
        .replace(/\{user\.tag\}/g, sanitizeInput(client.user.tag)),
    );
  }

  const category = ticketCategories[ticketButton];
  const categoryIDs = category.closedCategoryID;
  const closedCategoryID = await findAvailableCategory(categoryIDs);
  const ticketCreatorPerms = category?.permissions?.ticketCreator;
  const rolesPerms = category?.permissions?.supportRoles;
  const creatorClosePerms = await getPermissionOverwrites(
    ticketCreatorPerms,
    "close",
    {
      allow: [],
      deny: ["SendMessages"],
    },
  );
  const rolesClosePerms = await getPermissionOverwrites(rolesPerms, "close", {
    allow: [],
    deny: ["SendMessages"],
  });

  const addedUsersPerms = category?.permissions?.addedUsers;
  const addedUsersClosePerms = await getPermissionOverwrites(
    addedUsersPerms,
    "close",
    {
      allow: [],
      deny: ["SendMessages"],
    },
  );
  const addedRolesPerms = category?.permissions?.addedRoles;
  const addedRolesClosePerms = await getPermissionOverwrites(
    addedRolesPerms,
    "close",
    {
      allow: [],
      deny: ["SendMessages"],
    },
  );

  if (ticketChannel.members.has(ticketUserID.id)) {
    await ticketChannel.permissionOverwrites.edit(
      ticketUserID,
      creatorClosePerms,
    );
  }

  await ticketChannel.setParent(closedCategoryID, {
    lockPermissions: false,
  });

  category.support_role_ids.forEach(async (roleId) => {
    await ticketChannel.permissionOverwrites
      .edit(roleId, rolesClosePerms)
      .catch((error) => {
        console.error(`Error updating permissions of support roles:`, error);
      });
  });

  if (claimUser) {
    await ticketChannel.permissionOverwrites.edit(claimUser, {
      SendMessages: false,
      ViewChannel: true,
    });
  }

  const addedUsers = (await ticketsDB.get(`${channelID}.addedUsers`)) || [];
  const addedRoles = (await ticketsDB.get(`${channelID}.addedRoles`)) || [];
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
      await ticketChannel.permissionOverwrites.edit(
        member,
        addedUsersClosePerms,
      );
    }
  } catch (error) {
    console.error(
      "An error occurred while editing permission overwrites on closing a ticket:",
      error,
    );
  }

  try {
    for (const role of rolesArray) {
      await ticketChannel.permissionOverwrites.edit(role, addedRolesClosePerms);
    }
  } catch (error) {
    console.error(
      "An error occurred while editing permission overwrites on closing a ticket:",
      error,
    );
  }

  let messageID;
  const options = { embeds: [closeEmbed], fetchReply: true };
  if (row.components.length > 0) {
    options.components = [row];
  }
  await ticketChannel.send(options).then(async function (message) {
    messageID = message.id;
  });
  await ticketsDB.set(`${channelID}.closeMsgID`, messageID);
  await ticketsDB.set(`${channelID}.status`, "Closed");
  await mainDB.pull("openTickets", channelID);
  let logChannelId = config.logs.ticketClose || config.logs.default;
  let logsChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketClose) {
    try {
      await logsChannel.send({ embeds: [logCloseEmbed] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }
  logMessage(
    `${client.user.tag} automatically closed the ticket #${ticketChannel.name} which was created by ${ticketUserID.tag}`,
  );

  if (!creatorLeft) {
    if (config.closeDMEmbed.enabled) {
      const defaultDMValues = {
        color: "#FF0000",
        title: "Ticket Closed",
        description:
          "Your ticket **#{ticketName}** has been closed by {user} in **{server}**.",
      };

      const closeDMEmbed = await configEmbed("closeDMEmbed", defaultDMValues);

      if (closeDMEmbed.data && closeDMEmbed.data.description) {
        closeDMEmbed.setDescription(
          closeDMEmbed.data.description
            .replace(/\{ticketName\}/g, `${ticketChannel.name}`)
            .replace(/\{user\}/g, `<@!${client.user.id}>`)
            .replace(
              /\{server\}/g,
              `${client.guilds.cache.get(process.env.GUILD_ID).name}`,
            ),
        );
      }

      const userPreference = await getUserPreference(ticketUserID.id, "close");
      if (userPreference) {
        try {
          await ticketUserID.send({ embeds: [closeDMEmbed] });
        } catch (error) {
          error.errorContext = `[Auto Close Error]: failed to DM ${ticketUserID.tag} because their DMs were closed.`;
          client.emit("error", error);
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
          let logChannel = getChannel(logChannelId);

          let dmErrorReply = {
            embeds: [dmErrorEmbed],
          };

          if (config.dmErrorEmbed.pingUser) {
            dmErrorReply.content = `<@${ticketUserID.id}>`;
          }

          if (config.toggleLogs.DMErrors) {
            try {
              await logChannel.send(dmErrorReply);
            } catch (error) {
              error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
              client.emit("error", error);
            }
          }
          logMessage(
            `The bot could not DM ${ticketUserID.tag} because their DMs were closed`,
          );
        }
      }
    }
  }
}

module.exports = {
  autoCloseTicket,
};
