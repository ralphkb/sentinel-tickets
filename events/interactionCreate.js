const {
  Events,
  Collection,
  InteractionType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const {
  client,
  mainDB,
  ticketsDB,
  ticketCategories,
  blacklistDB,
} = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  checkSupportRole,
  getRole,
  getChannel,
  findAvailableCategory,
  isBlacklistExpired,
  addTicketCreator,
  parseDurationToMilliseconds,
} = require("../utils/mainUtils.js");
const { closeTicket } = require("../utils/ticketClose.js");
const { reopenTicket } = require("../utils/ticketReopen.js");
const { deleteTicket } = require("../utils/ticketDelete.js");
const { claimTicket } = require("../utils/ticketClaim.js");
const { unclaimTicket } = require("../utils/ticketUnclaim.js");
const { transcriptTicket } = require("../utils/ticketTranscript.js");
const dotenv = require("dotenv");
dotenv.config();
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const buttonCooldown = new Map();
const moment = require("moment-timezone");
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const cooldown =
      config.buttons_cooldown !== undefined
        ? config.buttons_cooldown * 1000
        : 5000;
    const cooldownEnd =
      cooldown - (Date.now() - buttonCooldown.get(interaction.user.id));
    const timeReadable = Math.floor(cooldownEnd / 1000);
    const defaultCooldownValues = {
      color: "#FF0000",
      title: "Cooldown",
      description:
        "You have to wait **{time}** seconds before clicking this button!",
      timestamp: true,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };
    const cooldownEmbed = await configEmbed(
      "cooldownEmbed",
      defaultCooldownValues,
    );
    if (cooldownEmbed.data && cooldownEmbed.data.description) {
      cooldownEmbed.setDescription(
        cooldownEmbed.data.description.replace(/\{time\}/g, `${timeReadable}`),
      );
    }
    const maxOpenTickets = config.maxOpenTickets || 1;
    const defaultValues = {
      color: "#FF0000",
      title: "Maximum Tickets Open",
      description: "You may only have **{max} ticket(s)** open at a time.",
      timestamp: true,
      footer: {
        text: `${interaction.user.tag}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };
    const maxOpenTicketsEmbed = await configEmbed(
      "maxOpenTicketsEmbed",
      defaultValues,
    );
    if (maxOpenTicketsEmbed.data && maxOpenTicketsEmbed.data.description) {
      maxOpenTicketsEmbed.setDescription(
        maxOpenTicketsEmbed.data.description.replace(
          /\{max\}/g,
          `${maxOpenTickets}`,
        ),
      );
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

    if (
      interaction.isChatInputCommand() ||
      interaction.isContextMenuCommand()
    ) {
      const command = client.commands.get(interaction.commandName);

      if (!command) return;

      const { cooldowns } = client;

      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
      }

      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name);
      const defaultCooldownDuration = config.commands_cooldown || 5;
      const cooldownAmount =
        (command.cooldown ?? defaultCooldownDuration) * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expirationTime =
          timestamps.get(interaction.user.id) + cooldownAmount;

        if (now < expirationTime) {
          const expiredTimestamp = Math.round(expirationTime / 1000);
          const defaultCmdValues = {
            color: "#FF0000",
            title: "Command Cooldown",
            description:
              "Please wait, you are on a cooldown for `{command}`.\nYou can use it again in {time}.",
            timestamp: true,
            footer: {
              text: `${interaction.user.tag}`,
              iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            },
          };
          const commandCooldownEmbed = await configEmbed(
            "commandCooldownEmbed",
            defaultCmdValues,
          );
          if (
            commandCooldownEmbed.data &&
            commandCooldownEmbed.data.description
          ) {
            commandCooldownEmbed.setDescription(
              commandCooldownEmbed.data.description
                .replace(/\{command\}/g, `${command.data.name}`)
                .replace(/\{time\}/g, `<t:${expiredTimestamp}:R>`),
            );
          }
          return interaction.reply({
            embeds: [commandCooldownEmbed],
            ephemeral: true,
          });
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(
          `[InteractionCreate] ${command.data.name} command error: ${error}`,
        );
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "categoryMenu") {
        // Reset the select menu upon selection
        const messageId = interaction.message.id;
        const selectMenuOptions = await mainDB.get(
          `selectMenuOptions-${messageId}`,
        );
        await interaction.channel.messages
          .fetch(messageId)
          .then(async (message) => {
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId("categoryMenu")
              .setPlaceholder(
                selectMenuOptions?.placeholder ||
                  "Select a category to open a ticket.",
              )
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(selectMenuOptions.options);

            const updatedActionRow = new ActionRowBuilder().addComponents(
              selectMenu,
            );
            await message.edit({ components: [updatedActionRow] });
          });

        const userRoles = interaction.member.roles.cache.map((role) => role.id);
        let isUserBlacklisted = await blacklistDB.get(
          `user-${interaction.user.id}`,
        );
        let isRoleBlacklisted = false;

        for (const roleId of userRoles) {
          const roleBlacklist = await blacklistDB.get(`role-${roleId}`);
          if (roleBlacklist) {
            if (
              isBlacklistExpired(
                roleBlacklist.timestamp,
                roleBlacklist.duration,
              )
            ) {
              await blacklistDB.delete(`role-${roleId}`);
            } else {
              isRoleBlacklisted = roleBlacklist;
              break;
            }
          }
        }

        if (
          isUserBlacklisted &&
          isBlacklistExpired(
            isUserBlacklisted.timestamp,
            isUserBlacklisted.duration,
          )
        ) {
          await blacklistDB.delete(`user-${interaction.user.id}`);
          isUserBlacklisted = null;
          const blacklistRoles = config.rolesOnBlacklist || [];
          blacklistRoles.forEach(async (roleId) => {
            const role = await getRole(roleId);
            if (role) {
              await interaction.member.roles
                .remove(role)
                .catch((error) =>
                  console.error(
                    `Error removing role from blacklisted user: ${error}`,
                  ),
                );
            } else {
              console.error(`Role with ID ${roleId} not found.`);
            }
          });
        }

        if (isUserBlacklisted || isRoleBlacklisted) {
          let expiryDate;
          if (isUserBlacklisted) {
            const expirationTime =
              isUserBlacklisted?.timestamp +
              parseDurationToMilliseconds(isUserBlacklisted?.duration);
            expiryDate =
              isUserBlacklisted?.duration === "permanent"
                ? "Never"
                : `<t:${Math.floor(expirationTime / 1000)}:R>`;
          } else if (isRoleBlacklisted) {
            const expirationTime =
              isRoleBlacklisted?.timestamp +
              parseDurationToMilliseconds(isRoleBlacklisted?.duration);
            expiryDate =
              isRoleBlacklisted?.duration === "permanent"
                ? "Never"
                : `<t:${Math.floor(expirationTime / 1000)}:R>`;
          }
          const defaultblacklistedValues = {
            color: "#FF0000",
            title: "Blacklisted",
            description:
              "You are currently blacklisted from creating tickets.\nExpires: {time}",
            timestamp: true,
            footer: {
              text: `${interaction.user.tag}`,
              iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            },
          };

          const blacklistedEmbed = await configEmbed(
            "blacklistedEmbed",
            defaultblacklistedValues,
          );

          if (blacklistedEmbed.data && blacklistedEmbed.data.description) {
            blacklistedEmbed.setDescription(
              blacklistedEmbed.data.description.replace(
                /\{time\}/g,
                expiryDate,
              ),
            );
          }

          return interaction.reply({
            embeds: [blacklistedEmbed],
            ephemeral: true,
          });
        }

        if (buttonCooldown.has(interaction.user.id))
          return interaction.reply({
            embeds: [cooldownEmbed],
            ephemeral: true,
          });

        if (timeRegex.test(openingTime) && timeRegex.test(closingTime)) {
          if (config.workingHours.enabled && blockTicketCreation) {
            if (
              userCurrentTime.isBefore(openingTimeToday) ||
              userCurrentTime.isAfter(closingTimeToday)
            ) {
              const defaultValues = {
                color: "#FF0000",
                title: "Working Hours",
                description:
                  "Tickets are only open between {openingTime} and {closingTime}.\nThe current time now is {now}.",
                timestamp: true,
              };

              const workingHoursEmbed = await configEmbed(
                "workingHoursEmbed",
                defaultValues,
              );

              if (
                workingHoursEmbed.data &&
                workingHoursEmbed.data.description
              ) {
                workingHoursEmbed.setDescription(
                  workingHoursEmbed.data.description
                    .replace(
                      /\{openingTime\}/g,
                      `<t:${openingTimeToday.unix()}:t>`,
                    )
                    .replace(
                      /\{closingTime\}/g,
                      `<t:${closingTimeToday.unix()}:t>`,
                    )
                    .replace(
                      /\{now\}/g,
                      `<t:${Math.floor(new Date().getTime() / 1000)}:t>`,
                    ),
                );
              }
              return interaction.reply({
                embeds: [workingHoursEmbed],
                ephemeral: true,
              });
            }
          }
        }
        const customIds = Object.keys(ticketCategories);

        customIds.forEach(async (customId) => {
          if (interaction.values[0] === customId) {
            buttonCooldown.set(interaction.user.id, Date.now());
            setTimeout(
              () => buttonCooldown.delete(interaction.user.id),
              cooldown,
            );
            const category = ticketCategories[customId];

            if (
              category.creatorRoles.length > 0 &&
              !userRoles.some((roleId) =>
                category.creatorRoles.includes(roleId),
              )
            ) {
              const defaultcreatorValues = {
                color: "#FF0000",
                title: "Not Allowed",
                description:
                  "You are not allowed to create tickets in this category.",
                timestamp: true,
                footer: {
                  text: `${interaction.user.tag}`,
                  iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
                },
              };

              const categoryNotAllowedEmbed = await configEmbed(
                "categoryNotAllowedEmbed",
                defaultcreatorValues,
              );
              return interaction.reply({
                embeds: [categoryNotAllowedEmbed],
                ephemeral: true,
              });
            }

            const userTicketCount = interaction.guild.channels.cache.reduce(
              async (count, channel) => {
                if (await ticketsDB.has(channel.id)) {
                  const { userID, status } = await ticketsDB.get(channel.id);
                  if (userID === interaction.user.id && status !== "Closed") {
                    return (await count) + 1;
                  }
                }
                return await count;
              },
              Promise.resolve(0),
            );

            if ((await userTicketCount) >= maxOpenTickets) {
              return interaction.reply({
                embeds: [maxOpenTicketsEmbed],
                ephemeral: true,
              });
            }

            const modal = new ModalBuilder()
              .setCustomId(`${customId}-modal`)
              .setTitle(category.modalTitle);

            const modalQuestions = [];
            const actionRows = [];
            let questionIndex = 0;

            category.questions.forEach((question) => {
              const { label, placeholder, style, required, minLength } =
                question;

              const modalQuestion = new TextInputBuilder()
                .setCustomId(`question${questionIndex + 1}`)
                .setLabel(label)
                .setStyle(style)
                .setPlaceholder(placeholder)
                .setMinLength(minLength)
                .setRequired(required);

              if (style === "Paragraph") {
                modalQuestion.setMaxLength(1000);
              }

              modalQuestions.push(modalQuestion);
              questionIndex++;
            });

            modalQuestions.forEach((question) => {
              const actionRow = new ActionRowBuilder().addComponents(question);
              actionRows.push(actionRow);
            });

            actionRows.forEach((actionRow) => {
              modal.addComponents(actionRow);
            });

            await interaction.showModal(modal);
          }
        });
      }

      if (interaction.customId === "ratingMenu") {
        // Reset the select menu upon selection
        const ratingMenuOptions = await mainDB.get("ratingMenuOptions");
        try {
          const dmChannel = await interaction.user.createDM();
          const message = await dmChannel.messages.fetch(
            interaction.message.id,
          );

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("ratingMenu")
            .setPlaceholder(config.DMUserSettings.ratingSystem.menu.placeholder)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(ratingMenuOptions);

          const updatedActionRow = new ActionRowBuilder().addComponents(
            selectMenu,
          );
          await message.edit({ components: [updatedActionRow] });
        } catch (error) {
          console.error("Error fetching DM channel or message:", error);
        }

        for (let i = 1; i <= 5; i++) {
          if (interaction.values[0] === `${i}-star`) {
            const modal = new ModalBuilder()
              .setCustomId(`${i}-ratingModal`)
              .setTitle(config.DMUserSettings.ratingSystem.modalTitle);

            const modalQuestions = [];
            const actionRows = [];
            let questionIndex = 0;
            const questions = config.DMUserSettings.ratingSystem.questions;

            questions.forEach((question) => {
              const { label, placeholder, style, required, minLength } =
                question;

              const modalQuestion = new TextInputBuilder()
                .setCustomId(`ratingQuestion${questionIndex + 1}`)
                .setLabel(label)
                .setStyle(style)
                .setPlaceholder(placeholder)
                .setMinLength(minLength)
                .setRequired(required);

              if (style === "Paragraph") {
                modalQuestion.setMaxLength(1000);
              }

              modalQuestions.push(modalQuestion);
              questionIndex++;
            });

            modalQuestions.forEach((question) => {
              const actionRow = new ActionRowBuilder().addComponents(question);
              actionRows.push(actionRow);
            });

            actionRows.forEach((actionRow) => {
              modal.addComponents(actionRow);
            });

            await interaction.showModal(modal);
          }
        }
      }

      if (interaction.customId === "ticketOpenMenu") {
        // Reset the select menu upon selection
        const messageId = interaction.message.id;
        const ticketOpenMenuOptions = await mainDB.get("ticketOpenMenuOptions");
        await interaction.channel.messages
          .fetch(messageId)
          .then(async (message) => {
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId("ticketOpenMenu")
              .setPlaceholder(
                ticketOpenMenuOptions.placeholder || "Select an option",
              )
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(ticketOpenMenuOptions.options);

            const updatedActionRow = new ActionRowBuilder().addComponents(
              selectMenu,
            );
            await message.edit({ components: [updatedActionRow] });
          });

        if (interaction.values[0] === "closeTicket") {
          if (
            (await ticketsDB.get(`${interaction.channel.id}.status`)) ===
            "Closed"
          ) {
            return interaction.reply({
              content: "This ticket is already closed!",
              ephemeral: true,
            });
          }

          const closeStaffOnly =
            config.closeStaffOnly !== undefined ? config.closeStaffOnly : true;

          if (closeStaffOnly) {
            const hasSupportRole = await checkSupportRole(interaction);
            if (!hasSupportRole) {
              return interaction.reply({
                content:
                  config.errors.not_allowed ||
                  "You are not allowed to use this!",
                ephemeral: true,
              });
            }
          }

          const allowedRoles = config.closeButton.allowedRoles ?? [];
          if (
            allowedRoles.length !== 0 &&
            !interaction.member.roles.cache.some((role) =>
              allowedRoles.includes(role.id),
            )
          ) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }

          await interaction.deferReply();
          await closeTicket(interaction);
        }

        if (interaction.values[0] === "ticketclaim") {
          const claimKey = `isClaimInProgress-${interaction.channel.id}`;
          const isClaimInProgress = await mainDB.get(claimKey);
          if (isClaimInProgress) {
            return interaction.reply({
              content: "Another user is already claiming this ticket.",
              ephemeral: true,
            });
          }

          await mainDB.set(claimKey, true);
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            await mainDB.delete(claimKey).catch((error) => {
              console.error(
                `Error deleting claim key for ticket #${interaction.channel.name}:`,
                error,
              );
            });
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }

          if (
            (await ticketsDB.get(`${interaction.channel.id}.status`)) ===
            "Closed"
          ) {
            await mainDB.delete(claimKey).catch((error) => {
              console.error(
                `Error deleting claim key for ticket #${interaction.channel.name}:`,
                error,
              );
            });
            return interaction.reply({
              content: "You cannot claim a closed ticket!",
              ephemeral: true,
            });
          }

          await interaction.deferReply({ ephemeral: true });
          await claimTicket(interaction);
        }

        if (interaction.values[0] === "ticketunclaim") {
          if (
            (await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false
          )
            return interaction.reply({
              content: "This ticket has not been claimed!",
              ephemeral: true,
            });
          if (
            (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
            interaction.user.id
          )
            return interaction.reply({
              content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
              ephemeral: true,
            });

          await interaction.deferReply({ ephemeral: true });
          await unclaimTicket(interaction);
        }
      }

      if (interaction.customId === "closeMenu") {
        // Reset the select menu upon selection
        const messageId = interaction.message.id;
        const closeMenuOptions = await mainDB.get("closeMenuOptions");
        await interaction.channel.messages
          .fetch(messageId)
          .then(async (message) => {
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId("closeMenu")
              .setPlaceholder(
                closeMenuOptions.placeholder || "Select an option",
              )
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(closeMenuOptions.options);

            const updatedActionRow = new ActionRowBuilder().addComponents(
              selectMenu,
            );
            await message.edit({ components: [updatedActionRow] });
          });

        if (interaction.values[0] === "reOpen") {
          const reOpenStaffOnly =
            config.reOpenStaffOnly !== undefined
              ? config.reOpenStaffOnly
              : false;
          if (reOpenStaffOnly) {
            const hasSupportRole = await checkSupportRole(interaction);
            if (!hasSupportRole) {
              return interaction.reply({
                content:
                  config.errors.not_allowed ||
                  "You are not allowed to use this!",
                ephemeral: true,
              });
            }
          }

          const allowedRoles = config.reOpenButton.allowedRoles ?? [];
          if (
            allowedRoles.length !== 0 &&
            !interaction.member.roles.cache.some((role) =>
              allowedRoles.includes(role.id),
            )
          ) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }

          await interaction.deferReply();
          await reopenTicket(interaction);
        }

        if (interaction.values[0] === "createTranscript") {
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }
          const isEphemeral =
            config.transcriptReplyEmbed.ephemeral !== undefined
              ? config.transcriptReplyEmbed.ephemeral
              : true;
          await interaction.deferReply({ ephemeral: isEphemeral });
          await transcriptTicket(interaction);
        }

        if (interaction.values[0] === "deleteTicket") {
          const deleteStaffOnly =
            config.deleteStaffOnly !== undefined
              ? config.deleteStaffOnly
              : true;
          if (deleteStaffOnly) {
            const hasSupportRole = await checkSupportRole(interaction);
            if (!hasSupportRole) {
              return interaction.reply({
                content:
                  config.errors.not_allowed ||
                  "You are not allowed to use this!",
                ephemeral: true,
              });
            }
          }

          const allowedRoles = config.deleteButton.allowedRoles ?? [];
          if (
            allowedRoles.length !== 0 &&
            !interaction.member.roles.cache.some((role) =>
              allowedRoles.includes(role.id),
            )
          ) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }

          await interaction.deferReply();
          await deleteTicket(interaction);
        }
      }
    } else if (interaction.isButton()) {
      const userRoles = interaction.member.roles.cache.map((role) => role.id);
      let isUserBlacklisted = await blacklistDB.get(
        `user-${interaction.user.id}`,
      );
      let isRoleBlacklisted = false;

      for (const roleId of userRoles) {
        const roleBlacklist = await blacklistDB.get(`role-${roleId}`);
        if (roleBlacklist) {
          if (
            isBlacklistExpired(roleBlacklist.timestamp, roleBlacklist.duration)
          ) {
            await blacklistDB.delete(`role-${roleId}`);
          } else {
            isRoleBlacklisted = true;
            break;
          }
        }
      }

      if (
        isUserBlacklisted &&
        isBlacklistExpired(
          isUserBlacklisted.timestamp,
          isUserBlacklisted.duration,
        )
      ) {
        await blacklistDB.delete(`user-${interaction.user.id}`);
        isUserBlacklisted = null;
        const blacklistRoles = config.rolesOnBlacklist || [];
        blacklistRoles.forEach(async (roleId) => {
          const role = await getRole(roleId);
          if (role) {
            await interaction.member.roles
              .remove(role)
              .catch((error) =>
                console.error(
                  `Error removing role from blacklisted user: ${error}`,
                ),
              );
          } else {
            console.error(`Role with ID ${roleId} not found.`);
          }
        });
      }

      if (isUserBlacklisted || isRoleBlacklisted) {
        const expirationTime =
          isUserBlacklisted?.timestamp +
          parseDurationToMilliseconds(isUserBlacklisted?.duration);
        const expiryDate =
          isUserBlacklisted?.duration === "permanent"
            ? "Never"
            : `<t:${Math.floor(expirationTime / 1000)}:R>`;
        const defaultblacklistedValues = {
          color: "#FF0000",
          title: "Blacklisted",
          description:
            "You are currently blacklisted from creating tickets.\nExpires: {time}",
          timestamp: true,
          footer: {
            text: `${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const blacklistedEmbed = await configEmbed(
          "blacklistedEmbed",
          defaultblacklistedValues,
        );

        if (blacklistedEmbed.data && blacklistedEmbed.data.description) {
          blacklistedEmbed.setDescription(
            blacklistedEmbed.data.description.replace(/\{time\}/g, expiryDate),
          );
        }

        return interaction.reply({
          embeds: [blacklistedEmbed],
          ephemeral: true,
        });
      }

      if (buttonCooldown.has(interaction.user.id))
        return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });

      const customIds = Object.keys(ticketCategories);

      customIds.forEach(async (customId) => {
        if (interaction.customId === customId) {
          buttonCooldown.set(interaction.user.id, Date.now());
          setTimeout(
            () => buttonCooldown.delete(interaction.user.id),
            cooldown,
          );
          const category = ticketCategories[customId];

          if (timeRegex.test(openingTime) && timeRegex.test(closingTime)) {
            if (config.workingHours.enabled && blockTicketCreation) {
              if (
                userCurrentTime.isBefore(openingTimeToday) ||
                userCurrentTime.isAfter(closingTimeToday)
              ) {
                const defaultValues = {
                  color: "#FF0000",
                  title: "Working Hours",
                  description:
                    "Tickets are only open between {openingTime} and {closingTime}.\nThe current time now is {now}.",
                  timestamp: true,
                };

                const workingHoursEmbed = await configEmbed(
                  "workingHoursEmbed",
                  defaultValues,
                );

                if (
                  workingHoursEmbed.data &&
                  workingHoursEmbed.data.description
                ) {
                  workingHoursEmbed.setDescription(
                    workingHoursEmbed.data.description
                      .replace(
                        /\{openingTime\}/g,
                        `<t:${openingTimeToday.unix()}:t>`,
                      )
                      .replace(
                        /\{closingTime\}/g,
                        `<t:${closingTimeToday.unix()}:t>`,
                      )
                      .replace(
                        /\{now\}/g,
                        `<t:${Math.floor(new Date().getTime() / 1000)}:t>`,
                      ),
                  );
                }
                return interaction.reply({
                  embeds: [workingHoursEmbed],
                  ephemeral: true,
                });
              }
            }
          }

          if (
            category.creatorRoles.length > 0 &&
            !userRoles.some((roleId) => category.creatorRoles.includes(roleId))
          ) {
            const defaultcreatorValues = {
              color: "#FF0000",
              title: "Not Allowed",
              description:
                "You are not allowed to create tickets in this category.",
              timestamp: true,
              footer: {
                text: `${interaction.user.tag}`,
                iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              },
            };

            const categoryNotAllowedEmbed = await configEmbed(
              "categoryNotAllowedEmbed",
              defaultcreatorValues,
            );
            return interaction.reply({
              embeds: [categoryNotAllowedEmbed],
              ephemeral: true,
            });
          }

          const userTicketCount = interaction.guild.channels.cache.reduce(
            async (count, channel) => {
              if (await ticketsDB.has(channel.id)) {
                const { userID, status } = await ticketsDB.get(channel.id);
                if (userID === interaction.user.id && status !== "Closed") {
                  return (await count) + 1;
                }
              }
              return await count;
            },
            Promise.resolve(0),
          );

          if ((await userTicketCount) >= maxOpenTickets) {
            return interaction.reply({
              embeds: [maxOpenTicketsEmbed],
              ephemeral: true,
            });
          }

          const modal = new ModalBuilder()
            .setCustomId(`${customId}-modal`)
            .setTitle(category.modalTitle);

          const modalQuestions = [];
          const actionRows = [];
          let questionIndex = 0;

          category.questions.forEach((question) => {
            const { label, placeholder, style, required, minLength } = question;

            const modalQuestion = new TextInputBuilder()
              .setCustomId(`question${questionIndex + 1}`)
              .setLabel(label)
              .setStyle(style)
              .setPlaceholder(placeholder)
              .setMinLength(minLength)
              .setRequired(required);

            if (style === "Paragraph") {
              modalQuestion.setMaxLength(1000);
            }

            modalQuestions.push(modalQuestion);
            questionIndex++;
          });

          modalQuestions.forEach((question) => {
            const actionRow = new ActionRowBuilder().addComponents(question);
            actionRows.push(actionRow);
          });

          actionRows.forEach((actionRow) => {
            modal.addComponents(actionRow);
          });

          await interaction.showModal(modal);
        }
      });

      // Ticket Transcript button
      if (interaction.customId === "createTranscript") {
        const hasSupportRole = await checkSupportRole(interaction);
        if (!hasSupportRole) {
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }
        const isEphemeral =
          config.transcriptReplyEmbed.ephemeral !== undefined
            ? config.transcriptReplyEmbed.ephemeral
            : true;
        await interaction.deferReply({ ephemeral: isEphemeral });
        await transcriptTicket(interaction);
      }

      // Ticket Re-Open button
      if (interaction.customId === "reOpen") {
        const reOpenStaffOnly =
          config.reOpenStaffOnly !== undefined ? config.reOpenStaffOnly : false;
        if (reOpenStaffOnly) {
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }
        }

        const allowedRoles = config.reOpenButton.allowedRoles ?? [];
        if (
          allowedRoles.length !== 0 &&
          !interaction.member.roles.cache.some((role) =>
            allowedRoles.includes(role.id),
          )
        ) {
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }

        await interaction.deferReply();
        await reopenTicket(interaction);
      }
      // Ticket Delete button
      if (interaction.customId === "deleteTicket") {
        const deleteStaffOnly =
          config.deleteStaffOnly !== undefined ? config.deleteStaffOnly : true;
        if (deleteStaffOnly) {
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }
        }

        const allowedRoles = config.deleteButton.allowedRoles ?? [];
        if (
          allowedRoles.length !== 0 &&
          !interaction.member.roles.cache.some((role) =>
            allowedRoles.includes(role.id),
          )
        ) {
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }

        await interaction.deferReply();
        await deleteTicket(interaction);
      }

      // Ticket Close Button
      if (interaction.customId === "closeTicket") {
        if (
          (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
        ) {
          return interaction.reply({
            content: "This ticket is already closed!",
            ephemeral: true,
          });
        }

        const closeStaffOnly =
          config.closeStaffOnly !== undefined ? config.closeStaffOnly : true;

        if (closeStaffOnly) {
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }
        }

        const allowedRoles = config.closeButton.allowedRoles ?? [];
        if (
          allowedRoles.length !== 0 &&
          !interaction.member.roles.cache.some((role) =>
            allowedRoles.includes(role.id),
          )
        ) {
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }

        await interaction.deferReply();
        await closeTicket(interaction);
      }

      // Ticket Claim button
      if (interaction.customId === "ticketclaim") {
        const claimKey = `isClaimInProgress-${interaction.channel.id}`;
        const isClaimInProgress = await mainDB.get(claimKey);
        if (isClaimInProgress) {
          return interaction.reply({
            content: "Another user is already claiming this ticket.",
            ephemeral: true,
          });
        }

        await mainDB.set(claimKey, true);
        const hasSupportRole = await checkSupportRole(interaction);
        if (!hasSupportRole) {
          await mainDB.delete(claimKey).catch((error) => {
            console.error(
              `Error deleting claim key for ticket #${interaction.channel.name}:`,
              error,
            );
          });
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }

        if (
          (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
        ) {
          await mainDB.delete(claimKey).catch((error) => {
            console.error(
              `Error deleting claim key for ticket #${interaction.channel.name}:`,
              error,
            );
          });
          return interaction.reply({
            content: "You cannot claim a closed ticket!",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });
        await claimTicket(interaction);
      }

      // Ticket Unclaim button
      if (interaction.customId === "ticketunclaim") {
        if (
          (await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false
        )
          return interaction.reply({
            content: "This ticket has not been claimed!",
            ephemeral: true,
          });
        if (
          (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
          interaction.user.id
        )
          return interaction.reply({
            content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
            ephemeral: true,
          });

        await interaction.deferReply({ ephemeral: true });
        await unclaimTicket(interaction);
      }
    } else if (interaction.type === InteractionType.ModalSubmit) {
      const customIds = Object.keys(ticketCategories);

      customIds.forEach(async (customId) => {
        if (interaction.customId === `${customId}-modal`) {
          const category = ticketCategories[customId];

          await interaction.deferReply({ ephemeral: true });
          const embedDescription = category.description
            .replace(/\{user\}/g, interaction.user)
            .replace(/\{user.tag\}/g, interaction.user.username);

          const defaultValues = {
            color: category.color || "#2FF200",
            description: embedDescription,
            timestamp: true,
            thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            footer: {
              text: `${interaction.user.tag}`,
              iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            },
          };

          const ticketOpenEmbed = await configEmbed(
            "ticketOpenEmbed",
            defaultValues,
          );

          ticketOpenEmbed.setDescription(embedDescription);
          ticketOpenEmbed.setColor(category.color || "#2FF200");
          ticketOpenEmbed.setAuthor({
            name: `${category.embedTitle}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          });

          for (
            let questionIndex = 0;
            questionIndex < category.questions.length;
            questionIndex++
          ) {
            const question = category.questions[questionIndex];
            const { label } = question;
            let value = interaction.fields.getTextInputValue(
              `question${questionIndex + 1}`,
            );

            if (category?.useCodeBlocks) {
              value = `\`\`\`${value}\`\`\``;
            } else {
              value = `>>> ${value}`;
            }
            ticketOpenEmbed.addFields({
              name: `${label}`,
              value: value,
            });
          }

          if (config.workingHours.enabled && config.workingHours.addField) {
            let workingHoursText = "";
            if (config.workingHours.valueDays === "ALL") {
              const currentDay = userCurrentTime.format("dddd").toLowerCase();
              for (const day in workingHours) {
                const { min, max } = workingHours[day];
                const isCurrentDay = day === currentDay;
                const dayText = isCurrentDay
                  ? `**${day.charAt(0).toUpperCase() + day.slice(1)}**`
                  : day.charAt(0).toUpperCase() + day.slice(1);
                let openTime = min || config.workingHours.default.min;
                let closeTime = max || config.workingHours.default.max;

                const openTimeToday = userCurrentTime
                  .clone()
                  .startOf("day")
                  .set({
                    hour: openTime.split(":")[0],
                    minute: openTime.split(":")[1],
                  });

                const closeTimeToday = userCurrentTime
                  .clone()
                  .startOf("day")
                  .set({
                    hour: closeTime.split(":")[0],
                    minute: closeTime.split(":")[1],
                  });

                const openingTimestamp = `<t:${openTimeToday.unix()}:t>`;
                const closingTimestamp = `<t:${closeTimeToday.unix()}:t>`;

                const workingHoursField = config.workingHours.fieldValue
                  ? `${config.workingHours.fieldValue}\n`
                  : `> {day}: {openingTime} to {closingTime}\n`;
                workingHoursText += workingHoursField
                  .replace(/\{day\}/g, dayText)
                  .replace(/\{openingTime\}/g, openingTimestamp)
                  .replace(/\{closingTime\}/g, closingTimestamp);
              }
            } else if (config.workingHours.valueDays === "TODAY") {
              workingHoursText +=
                `${config.workingHours.fieldValue || "> {day}: {openingTime} to {closingTime}"}`
                  .replace(
                    /\{day\}/g,
                    dayToday.charAt(0).toUpperCase() + dayToday.slice(1),
                  )
                  .replace(
                    /\{openingTime\}/g,
                    `<t:${openingTimeToday.unix()}:t>`,
                  )
                  .replace(
                    /\{closingTime\}/g,
                    `<t:${closingTimeToday.unix()}:t>`,
                  );
            }
            ticketOpenEmbed.addFields({
              name: config.workingHours.fieldTitle || "Working Hours",
              value: workingHoursText,
            });
          }

          let answerRow = new ActionRowBuilder();
          if (config.ticketOpenEmbed.useMenu) {
            const options = [];

            const closeOption = new StringSelectMenuOptionBuilder()
              .setLabel(config.closeButton.label)
              .setDescription(config.ticketOpenEmbed.closeDescription)
              .setValue("closeTicket")
              .setEmoji(config.closeButton.emoji);
            options.push(closeOption);

            if (config.claimFeature) {
              const claimOption = new StringSelectMenuOptionBuilder()
                .setLabel(config.claimButton.label)
                .setDescription(config.ticketOpenEmbed.claimDescription)
                .setValue("ticketclaim")
                .setEmoji(config.claimButton.emoji);
              options.push(claimOption);
            }

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId("ticketOpenMenu")
              .setPlaceholder(
                config.ticketOpenEmbed.menuPlaceholder || "Select an option",
              )
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(options);

            answerRow.addComponents(selectMenu);
            await mainDB.set("ticketOpenMenuOptions", {
              options,
              placeholder:
                config.ticketOpenEmbed.menuPlaceholder || "Select an option",
            });
          } else {
            const closeButton = new ButtonBuilder()
              .setCustomId("closeTicket")
              .setLabel(config.closeButton.label)
              .setEmoji(config.closeButton.emoji)
              .setStyle(ButtonStyle[config.closeButton.style]);

            answerRow.addComponents(closeButton);

            if (config.claimFeature) {
              const claimButton = new ButtonBuilder()
                .setCustomId("ticketclaim")
                .setLabel(config.claimButton.label)
                .setEmoji(config.claimButton.emoji)
                .setStyle(ButtonStyle[config.claimButton.style]);

              answerRow.addComponents(claimButton);
            }
          }

          try {
            const TICKETCOUNT = await mainDB.get("totalTickets");
            const USERNAME = interaction.user.username;
            const configValue = category.ticketName;
            const categoryIDs = category.categoryID;
            const selectedCategoryID = await findAvailableCategory(categoryIDs);
            const ticketCreatorPerms = category?.permissions?.ticketCreator;
            const allowedCreatorPerms = ticketCreatorPerms?.open?.allow || [
              "ViewChannel",
              "SendMessages",
              "EmbedLinks",
              "AttachFiles",
              "ReadMessageHistory",
            ];
            const deniedCreatorPerms = ticketCreatorPerms?.open?.deny || [];
            const openAllowCreator = allowedCreatorPerms.map(
              (permission) => PermissionFlagsBits[permission],
            );
            const openDenyCreator = deniedCreatorPerms.map(
              (permission) => PermissionFlagsBits[permission],
            );
            const rolesPerms = category?.permissions?.supportRoles;
            const allowedRolePerms = rolesPerms?.open?.allow || [
              "ViewChannel",
              "SendMessages",
              "EmbedLinks",
              "AttachFiles",
              "ReadMessageHistory",
            ];
            const deniedRolePerms = rolesPerms?.open?.deny || [];
            const openAllowRoles = allowedRolePerms.map(
              (permission) => PermissionFlagsBits[permission],
            );
            const openDenyRoles = deniedRolePerms.map(
              (permission) => PermissionFlagsBits[permission],
            );

            let channelName;
            switch (configValue) {
              case "USERNAME":
                channelName = `${category.name}-${USERNAME}`;
                break;
              case "TICKETCOUNT":
                channelName = `${category.name}-${TICKETCOUNT}`;
                break;
              case "BOTH":
                channelName = `${USERNAME}-${TICKETCOUNT}`;
                break;
              default:
                throw new Error(
                  `Invalid category ticketName configuration value: ${configValue}`,
                );
            }
            const nameEmoji = category.nameEmoji ?? "";
            if (nameEmoji !== "") {
              channelName = `${nameEmoji}-${channelName}`;
            }

            await interaction.guild.channels
              .create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: selectedCategoryID,
                rateLimitPerUser: category.slowmode || 0,
                topic: category.ticketTopic
                  .replace(/\{user\}/g, interaction.user.tag)
                  .replace(/\{type\}/g, category.name),
                permissionOverwrites: [
                  {
                    id: interaction.guild.id,
                    deny: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                    ],
                  },
                  {
                    id: interaction.user.id,
                    allow: openAllowCreator,
                    deny: openDenyCreator,
                  },
                  {
                    id: process.env.CLIENT_ID,
                    allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.ReadMessageHistory,
                    ],
                  },
                  ...category.support_role_ids.map((roleId) => ({
                    id: roleId,
                    allow: openAllowRoles,
                    deny: openDenyRoles,
                  })),
                ],
              })
              .then(async (channel) => {
                let textContent =
                  category.textContent !== undefined
                    ? category.textContent
                    : "Please wait for the support staff to check your ticket!";
                textContent = textContent
                  .replace(/\{user\}/g, interaction.user)
                  .replace(
                    /\{user\.tag\}/g,
                    sanitizeInput(interaction.user.tag),
                  );
                const pingRoles =
                  category.pingRoles && category.ping_role_ids.length > 0;
                if (pingRoles) {
                  const rolesToMention = category.ping_role_ids
                    .map((roleId) => `<@&${roleId}>`)
                    .join(" ");
                  textContent = textContent.replace(
                    /\{support-roles\}/g,
                    rolesToMention,
                  );
                }

                await channel
                  .send({
                    content: textContent,
                    embeds: [ticketOpenEmbed],
                    components: [answerRow],
                    fetchReply: true,
                  })
                  .then(async (message) => {
                    const defaultValues = {
                      color: "#2FF200",
                      title: "Ticket Created!",
                      description:
                        "Your new ticket ({channel}) has been created, **{user}**!",
                      timestamp: true,
                      footer: {
                        text: `${interaction.user.tag}`,
                        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
                      },
                    };

                    const newTicketEmbed = await configEmbed(
                      "newTicketEmbed",
                      defaultValues,
                    );

                    if (
                      newTicketEmbed.data &&
                      newTicketEmbed.data.description
                    ) {
                      newTicketEmbed.setDescription(
                        newTicketEmbed.data.description
                          .replace(/\{channel\}/g, `<#${channel.id}>`)
                          .replace(
                            /\{user\}/g,
                            `${sanitizeInput(interaction.user.username)}`,
                          ),
                      );
                    }
                    const actionRow4 = new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setURL(`${channel.url}`)
                        .setLabel(config.newTicketButton.label)
                        .setEmoji(config.newTicketButton.emoji),
                    );
                    await interaction.editReply({
                      embeds: [newTicketEmbed],
                      components: [actionRow4],
                      ephemeral: true,
                    });

                    const creationTime = Math.floor(
                      new Date().getTime() / 1000,
                    );

                    await ticketsDB.set(`${channel.id}`, {
                      userID: interaction.user.id,
                      ticketType: category.name,
                      button: customId,
                      msgID: message.id,
                      claimed: false,
                      claimUser: "",
                      status: "Open",
                      closeUserID: "",
                      creationTime: creationTime,
                      addedUsers: [],
                      addedRoles: [],
                    });

                    await mainDB.push("openTickets", `${channel.id}`);
                    await addTicketCreator(interaction.user.id);

                    const logDefaultValues = {
                      color: "#2FF200",
                      title: "Ticket Logs | Ticket Created",
                      timestamp: true,
                      thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
                      footer: {
                        text: `${interaction.user.tag}`,
                        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
                      },
                    };

                    const logTicketOpenEmbed = await configEmbed(
                      "logTicketOpenEmbed",
                      logDefaultValues,
                    );

                    logTicketOpenEmbed.addFields([
                      {
                        name:
                          config.logTicketOpenEmbed.field_creator ||
                          "• Ticket Creator",
                        value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
                      },
                      {
                        name:
                          config.logTicketOpenEmbed.field_ticket || "• Ticket",
                        value: `> #${sanitizeInput(channel.name)}`,
                      },
                      {
                        name:
                          config.logTicketOpenEmbed.field_creation ||
                          "• Creation Time",
                        value: `> <t:${creationTime}:F>`,
                      },
                    ]);

                    let logChannelId =
                      config.logs.ticketCreate || config.logs.default;
                    let logChannel = await getChannel(logChannelId);
                    if (config.toggleLogs.ticketCreate) {
                      try {
                        await logChannel.send({
                          embeds: [logTicketOpenEmbed],
                        });
                      } catch (error) {
                        error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
                        client.emit("error", error);
                      }
                    }
                    logMessage(
                      `${interaction.user.tag} created the ticket #${channel.name}`,
                    );

                    await message.pin().then(() => {
                      setTimeout(async () => {
                        await message.channel.bulkDelete(1);
                      }, 1250);
                    });
                  });

                await channel
                  .send({ content: `<@${interaction.user.id}>` })
                  .then((message) => {
                    message.delete();
                  });

                if (pingRoles && category.ghostPingRoles) {
                  const rolesToMention = category.ping_role_ids
                    .map((roleId) => `<@&${roleId}>`)
                    .join(" ");
                  await channel
                    .send({ content: rolesToMention })
                    .then((message) => {
                      message.delete();
                    });
                }

                if (
                  timeRegex.test(openingTime) &&
                  timeRegex.test(closingTime)
                ) {
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
                            .replace(
                              /\{openingTime\}/g,
                              `<t:${openingTimeToday.unix()}:t>`,
                            )
                            .replace(
                              /\{closingTime\}/g,
                              `<t:${closingTimeToday.unix()}:t>`,
                            ),
                        );
                      }
                      setTimeout(async () => {
                        await channel.send({
                          embeds: [outsideWorkingHoursEmbed],
                        });
                      }, 3000);
                    }
                  }
                }
              });

            await mainDB.set("totalTickets", TICKETCOUNT + 1);
          } catch (error) {
            console.error("Error creating ticket:", error);
            return null;
          }
        }
      });

      for (let i = 1; i <= 5; i++) {
        if (interaction.customId === `${i}-ratingModal`) {
          await interaction.deferReply({ ephemeral: true });
          const totalReviews = await mainDB.get("totalReviews");
          const message = await interaction.user.dmChannel.messages.fetch(
            interaction.message.id,
          );
          await message.edit({ components: [] });
          const currentFooter = message.embeds[0].footer.text;
          const defaultValues = {
            color: "#2FF200",
            title: "Ticket Logs | Ticket Feedback",
            timestamp: true,
            thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            footer: {
              text: `${interaction.user.tag}`,
              iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
            },
          };

          const logRatingEmbed = await configEmbed(
            "logRatingEmbed",
            defaultValues,
          );
          const questions = config.DMUserSettings.ratingSystem.questions;

          logRatingEmbed.addFields({
            name: "• Ticket Creator",
            value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
          });

          logRatingEmbed.addFields({
            name: "• Ticket",
            value: `> ${sanitizeInput(currentFooter)}`,
          });

          for (
            let questionIndex = 0;
            questionIndex < questions.length;
            questionIndex++
          ) {
            const question = questions[questionIndex];
            const { label } = question;
            const value = interaction.fields.getTextInputValue(
              `ratingQuestion${questionIndex + 1}`,
            );

            logRatingEmbed.addFields({
              name: `• ${label}`,
              value: `>>> ${value}`,
            });
          }
          logRatingEmbed.addFields({
            name: "• Ticket Rating",
            value: `${"⭐".repeat(i)} **(${i}/5)**`,
          });
          let logChannelId = config.logs.ticketFeedback || config.logs.default;
          let logChannel = await getChannel(logChannelId);
          if (config.toggleLogs.ticketFeedback) {
            try {
              await logChannel.send({ embeds: [logRatingEmbed] });
            } catch (error) {
              error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
              client.emit("error", error);
            }
          }
          await mainDB.set("totalReviews", totalReviews + 1);
          await mainDB.push("ratings", i);
          await interaction.editReply({
            content: "Your feedback has been sent successfully!",
            ephemeral: true,
          });
          logMessage(
            `${interaction.user.tag} rated the ticket "${currentFooter}" with ${i} stars`,
          );
        }
      }
    }
  },
};
