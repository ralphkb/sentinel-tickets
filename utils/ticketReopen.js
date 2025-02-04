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
  logError,
} = require("./mainUtils.js");
const moment = require("moment-timezone");
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

async function reopenTicket(interaction) {
  const ticketUserID = await getUser(
    await ticketsDB.get(`${interaction.channel.id}.userID`),
  );
  const ticketChannel = await getChannel(interaction.channel.id);
  const ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);
  const ticketType = await ticketsDB.get(
    `${interaction.channel.id}.ticketType`,
  );

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

  const logReopenEmbed = await configEmbed("logReopenEmbed", logDefaultValues);

  logReopenEmbed.addFields([
    {
      name: config.logReopenEmbed.field_staff || "• Re-Opened By",
      value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
    },
    {
      name: config.logReopenEmbed.field_user || "• Ticket Creator",
      value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
    },
    {
      name: config.logReopenEmbed.field_ticket || "• Ticket",
      value: `> #${sanitizeInput(interaction.channel.name)}\n> ${ticketType}`,
    },
  ]);

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

  const category = ticketCategories[ticketButton];
  const categoryIDs = category.categoryID;
  const categoryID = await findAvailableCategory(categoryIDs);
  const ticketCreatorPerms = category?.permissions?.ticketCreator;
  const rolesPerms = category?.permissions?.supportRoles;
  const creatorOpenPerms = await getPermissionOverwrites(
    ticketCreatorPerms,
    "open",
    {
      allow: [
        "ViewChannel",
        "SendMessages",
        "EmbedLinks",
        "AttachFiles",
        "ReadMessageHistory",
      ],
      deny: [],
    },
  );
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

  const addedUsersPerms = category?.permissions?.addedUsers;
  const addedUsersOpenPerms = await getPermissionOverwrites(
    addedUsersPerms,
    "open",
    {
      allow: [
        "ViewChannel",
        "SendMessages",
        "EmbedLinks",
        "AttachFiles",
        "ReadMessageHistory",
      ],
      deny: [],
    },
  );
  const addedRolesPerms = category?.permissions?.addedRoles;
  const addedRolesOpenPerms = await getPermissionOverwrites(
    addedRolesPerms,
    "open",
    {
      allow: [
        "ViewChannel",
        "SendMessages",
        "EmbedLinks",
        "AttachFiles",
        "ReadMessageHistory",
      ],
      deny: [],
    },
  );

  try {
    await interaction.channel.permissionOverwrites.edit(
      ticketUserID.id,
      creatorOpenPerms,
    );
  } catch (error) {
    console.error(
      "An error occurred while editing permission overwrites of the ticket creator, they might have left the server.",
      error,
    );
  }

  if (!category.categoryID.some((catId) => catId === ticketChannel.parentId)) {
    await ticketChannel.setParent(categoryID, {
      lockPermissions: false,
    });
  }

  category.support_role_ids.forEach(async (roleId) => {
    await interaction.channel.permissionOverwrites
      .edit(roleId, rolesOpenPerms)
      .catch((error) => {
        console.error(`Error updating permissions of support roles:`, error);
      });
  });

  const claimUserID = await ticketsDB.get(
    `${interaction.channel.id}.claimUser`,
  );
  let claimUser;

  if (claimUserID) {
    claimUser = await getUser(claimUserID);
  }
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
      await interaction.channel.permissionOverwrites.edit(
        member,
        addedUsersOpenPerms,
      );
    }
  } catch (error) {
    console.error(
      "An error occurred while editing permission overwrites on reopening a ticket:",
      error,
    );
  }

  try {
    for (const role of rolesArray) {
      await interaction.channel.permissionOverwrites.edit(
        role,
        addedRolesOpenPerms,
      );
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
  await ticketsDB.set(`${interaction.channel.id}.closedAt`, 0);
  await mainDB.add("openTickets", 1);
  await interaction.editReply({ embeds: [reopenEmbed] });
  let logChannelId = config.logs.ticketReopen || config.logs.default;
  let logsChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketReopen) {
    try {
      await logsChannel.send({ embeds: [logReopenEmbed] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }

  const userTimezone = config.workingHours.timezone;
  const workingHours = {};
  config.workingHours.days.forEach((dayConfig) => {
    workingHours[dayConfig.day.toLowerCase()] = {
      min: dayConfig.min,
      max: dayConfig.max,
      blockTicketCreation: dayConfig.blockTicketCreation,
    };
  });
  const userCurrentTime = moment.tz(userTimezone);
  const dayToday = userCurrentTime.format("dddd").toLowerCase();
  const openingTime =
    workingHours[dayToday]?.min || config.workingHours.default.min;
  const closingTime =
    workingHours[dayToday]?.max || config.workingHours.default.max;
  let blockTicketCreation;
  if (workingHours[dayToday]?.blockTicketCreation !== undefined) {
    blockTicketCreation = workingHours[dayToday].blockTicketCreation;
  } else {
    blockTicketCreation = config.workingHours.default.blockTicketCreation;
  }
  const openingTimeToday = userCurrentTime
    .clone()
    .startOf("day")
    .set({
      hour: openingTime.split(":")[0],
      minute: openingTime.split(":")[1],
    });
  const closingTimeToday = userCurrentTime
    .clone()
    .startOf("day")
    .set({
      hour: closingTime.split(":")[0],
      minute: closingTime.split(":")[1],
    });

  if (timeRegex.test(openingTime) && timeRegex.test(closingTime)) {
    if (
      config.workingHours.enabled &&
      !blockTicketCreation &&
      config.workingHours.outsideWarning
    ) {
      if (
        userCurrentTime.isBefore(openingTimeToday) ||
        userCurrentTime.isAfter(closingTimeToday)
      ) {
        const defaultValues = {
          color: "#FF0000",
          title: "Outside Working Hours",
          description:
            "You created a ticket outside of our working hours. Please be aware that our response time may be delayed.\nOur working hours for today are from {openingTime} to {closingTime}.",
          timestamp: true,
        };

        const outsideWorkingHoursEmbed = await configEmbed(
          "outsideWorkingHoursEmbed",
          defaultValues,
        );

        if (
          outsideWorkingHoursEmbed.data &&
          outsideWorkingHoursEmbed.data.description
        ) {
          outsideWorkingHoursEmbed.setDescription(
            outsideWorkingHoursEmbed.data.description
              .replace(/\{openingTime\}/g, `<t:${openingTimeToday.unix()}:t>`)
              .replace(/\{closingTime\}/g, `<t:${closingTimeToday.unix()}:t>`),
          );
        }
        await interaction.channel.send({
          embeds: [outsideWorkingHoursEmbed],
        });
      }
    }
  }

  await logMessage(
    `${interaction.user.tag} re-opened the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
  );

  if (config.reopenDMEmbed.enabled && interaction.user.id !== ticketUserID.id) {
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

    const userPreference = await getUserPreference(ticketUserID.id, "reopen");
    if (userPreference) {
      try {
        await ticketUserID.send({ embeds: [reopenDMEmbed] });
      } catch (error) {
        error.errorContext = `[Reopen Slash Command Error]: failed to DM ${ticketUserID.tag} because their DMs were closed.`;
        await logError("ERROR", error);
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
        let logChannel = await getChannel(logChannelId);

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
        await logMessage(
          `The bot could not DM ${ticketUserID.tag} because their DMs were closed`,
        );
      }
    }
  }
}

module.exports = {
  reopenTicket,
};
