const {
  Events,
  Collection,
  InteractionType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
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
  checkSupportRole,
  getRole,
  getChannel,
  isBlacklistExpired,
  getFirstClosedTicket,
  getBlacklistedEmbed,
  getUserTicketCount,
} = require("../utils/mainUtils.js");
const { closeTicket } = require("../utils/ticketClose.js");
const { reopenTicket } = require("../utils/ticketReopen.js");
const { deleteTicket } = require("../utils/ticketDelete.js");
const { claimTicket } = require("../utils/ticketClaim.js");
const { unclaimTicket } = require("../utils/ticketUnclaim.js");
const { transcriptTicket } = require("../utils/ticketTranscript.js");
const { getFeedback } = require("../utils/ticketFeedback.js");
const { createTicket } = require("../utils/ticketCreate.js");
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
    const workingHoursRoles = config.workingHours.bypassRoles ?? [];

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

    const timeObject = {
      userCurrentTime: userCurrentTime,
      workingHours: workingHours,
      openingTime: openingTime,
      closingTime: closingTime,
      openingTimeToday: openingTimeToday,
      closingTimeToday: closingTimeToday,
      dayToday: dayToday,
      blockTicketCreation: blockTicketCreation,
    };

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
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        await command.execute(interaction);
      } catch (error) {
        error.errorContext = `[InteractionCreate]: an error occurred while executing the ${command.data.name} command.`;
        client.emit("error", error);
        await interaction.editReply({
          content:
            config.errors.command_error ||
            "There was an error while executing this command!",
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "categoryMenu") {
        // Reset the select menu upon selection
        const messageId = await interaction.message.id;
        const selectMenuOptions = await mainDB.get(
          `selectMenuOptions-${messageId}`,
        );
        if (selectMenuOptions) {
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
        } else {
          console.error(
            `No select menu options found for message ID: ${messageId}, please try restarting the bot and re-sending the panel.`,
          );
        }

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
          const blacklistedEmbed = await getBlacklistedEmbed(
            interaction,
            isUserBlacklisted,
            isRoleBlacklisted,
          );

          return interaction.reply({
            embeds: [blacklistedEmbed],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (buttonCooldown.has(interaction.user.id))
          return interaction.reply({
            embeds: [cooldownEmbed],
            flags: MessageFlags.Ephemeral,
          });

        if (timeRegex.test(openingTime) && timeRegex.test(closingTime)) {
          if (config.workingHours.enabled && blockTicketCreation) {
            if (
              !interaction.member.roles.cache.some((role) =>
                workingHoursRoles.includes(role.id),
              )
            ) {
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
                  flags: MessageFlags.Ephemeral,
                });
              }
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
                flags: MessageFlags.Ephemeral,
              });
            }

            const preventNewTicket =
              config.preventNewTicket !== undefined
                ? config.preventNewTicket
                : false;
            if (preventNewTicket && parseInt(maxOpenTickets) === 1) {
              const defaultValues = {
                color: "#FF0000",
                title: "Closed ticket already exists",
                description:
                  "Your ticket {ticket} is still archived in the closed category, feel free to reopen it.",
                timestamp: true,
                thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
                footer: {
                  text: `${interaction.user.tag}`,
                  iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
                },
              };

              const preventNewTicketEmbed = await configEmbed(
                "preventNewTicketEmbed",
                defaultValues,
              );

              const ticketChannelID = await getFirstClosedTicket(
                interaction.user.id,
              );
              let ticketChannel = null;
              if (ticketChannelID) {
                ticketChannel = await getChannel(ticketChannelID);
              }

              if (ticketChannel) {
                if (
                  preventNewTicketEmbed.data &&
                  preventNewTicketEmbed.data.description
                ) {
                  preventNewTicketEmbed.setDescription(
                    preventNewTicketEmbed.data.description.replace(
                      /\{ticket\}/g,
                      `<#${ticketChannelID}>`,
                    ),
                  );
                }
                return interaction.reply({
                  embeds: [preventNewTicketEmbed],
                  flags: MessageFlags.Ephemeral,
                });
              }
            }

            const userTicketCount = await getUserTicketCount(interaction);
            if (maxOpenTickets > 0 && userTicketCount >= maxOpenTickets) {
              return interaction.reply({
                embeds: [maxOpenTicketsEmbed],
                flags: MessageFlags.Ephemeral,
              });
            }

            const modal = new ModalBuilder()
              .setCustomId(`${customId}-modal`)
              .setTitle(category.modalTitle);

            const modalQuestions = [];
            const actionRows = [];
            let questionIndex = 0;

            category.questions.forEach((question) => {
              let {
                label,
                placeholder,
                style,
                required,
                minLength,
                maxLength,
              } = question;

              const modalQuestion = new TextInputBuilder()
                .setCustomId(`question${questionIndex + 1}`)
                .setLabel(label)
                .setStyle(style)
                .setPlaceholder(placeholder)
                .setRequired(required);

              if (typeof minLength === "number" && minLength > 0) {
                modalQuestion.setMinLength(minLength);
              }

              if (style === "Paragraph") {
                if (
                  typeof maxLength !== "number" ||
                  maxLength < minLength ||
                  maxLength > 1000
                ) {
                  maxLength = 1000;
                  console.log(
                    `[WARN]: Invalid maxLength value for question ${questionIndex + 1}, falling back to the default 1000`,
                  );
                }
                modalQuestion.setMaxLength(maxLength);
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
            const withModal =
              config.DMUserSettings.ratingSystem.modal !== undefined
                ? config.DMUserSettings.ratingSystem.modal
                : true;
            if (withModal) {
              const modal = new ModalBuilder()
                .setCustomId(`${i}-ratingModal`)
                .setTitle(config.DMUserSettings.ratingSystem.modalTitle);

              const modalQuestions = [];
              const actionRows = [];
              let questionIndex = 0;
              const questions = config.DMUserSettings.ratingSystem.questions;

              questions.forEach((question) => {
                let {
                  label,
                  placeholder,
                  style,
                  required,
                  minLength,
                  maxLength,
                } = question;

                const modalQuestion = new TextInputBuilder()
                  .setCustomId(`ratingQuestion${questionIndex + 1}`)
                  .setLabel(label)
                  .setStyle(style)
                  .setPlaceholder(placeholder)
                  .setRequired(required);

                if (typeof minLength === "number" && minLength > 0) {
                  modalQuestion.setMinLength(minLength);
                }

                if (style === "Paragraph") {
                  if (
                    typeof maxLength !== "number" ||
                    maxLength < minLength ||
                    maxLength > 1000
                  ) {
                    maxLength = 1000;
                    console.log(
                      `[WARN]: Invalid maxLength value for rating question ${questionIndex + 1}, falling back to the default 1000`,
                    );
                  }
                  modalQuestion.setMaxLength(maxLength);
                }

                modalQuestions.push(modalQuestion);
                questionIndex++;
              });

              modalQuestions.forEach((question) => {
                const actionRow = new ActionRowBuilder().addComponents(
                  question,
                );
                actionRows.push(actionRow);
              });

              actionRows.forEach((actionRow) => {
                modal.addComponents(actionRow);
              });

              await interaction.showModal(modal);
            } else {
              await interaction.deferReply({ flags: MessageFlags.Ephemeral });
              await getFeedback(interaction, i, false);
            }
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
              flags: MessageFlags.Ephemeral,
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
                flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
            });
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await claimTicket(interaction);
        }

        if (interaction.values[0] === "ticketunclaim") {
          if (
            (await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false
          )
            return interaction.reply({
              content: "This ticket has not been claimed!",
              flags: MessageFlags.Ephemeral,
            });
          if (
            (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
            interaction.user.id
          )
            return interaction.reply({
              content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
              flags: MessageFlags.Ephemeral,
            });

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
                flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
            });
          }
          const isEphemeral =
            config.transcriptReplyEmbed.ephemeral !== undefined
              ? config.transcriptReplyEmbed.ephemeral
              : true;
          await interaction.deferReply({
            flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
          });
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
                flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
        const blacklistedEmbed = await getBlacklistedEmbed(
          interaction,
          isUserBlacklisted,
          isRoleBlacklisted,
        );

        return interaction.reply({
          embeds: [blacklistedEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (buttonCooldown.has(interaction.user.id))
        return interaction.reply({
          embeds: [cooldownEmbed],
          flags: MessageFlags.Ephemeral,
        });

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
                !interaction.member.roles.cache.some((role) =>
                  workingHoursRoles.includes(role.id),
                )
              ) {
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
                    flags: MessageFlags.Ephemeral,
                  });
                }
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
              flags: MessageFlags.Ephemeral,
            });
          }

          const preventNewTicket =
            config.preventNewTicket !== undefined
              ? config.preventNewTicket
              : false;
          if (preventNewTicket && parseInt(maxOpenTickets) === 1) {
            const defaultValues = {
              color: "#FF0000",
              title: "Closed ticket already exists",
              description:
                "Your ticket {ticket} is still archived in the closed category, feel free to reopen it.",
              timestamp: true,
              thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              footer: {
                text: `${interaction.user.tag}`,
                iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              },
            };

            const preventNewTicketEmbed = await configEmbed(
              "preventNewTicketEmbed",
              defaultValues,
            );

            const ticketChannelID = await getFirstClosedTicket(
              interaction.user.id,
            );
            let ticketChannel = null;
            if (ticketChannelID) {
              ticketChannel = await getChannel(ticketChannelID);
            }

            if (ticketChannel) {
              if (
                preventNewTicketEmbed.data &&
                preventNewTicketEmbed.data.description
              ) {
                preventNewTicketEmbed.setDescription(
                  preventNewTicketEmbed.data.description.replace(
                    /\{ticket\}/g,
                    `<#${ticketChannelID}>`,
                  ),
                );
              }
              return interaction.reply({
                embeds: [preventNewTicketEmbed],
                flags: MessageFlags.Ephemeral,
              });
            }
          }

          const userTicketCount = await getUserTicketCount(interaction);
          if (maxOpenTickets > 0 && userTicketCount >= maxOpenTickets) {
            return interaction.reply({
              embeds: [maxOpenTicketsEmbed],
              flags: MessageFlags.Ephemeral,
            });
          }

          const modal = new ModalBuilder()
            .setCustomId(`${customId}-modal`)
            .setTitle(category.modalTitle);

          const modalQuestions = [];
          const actionRows = [];
          let questionIndex = 0;

          category.questions.forEach((question) => {
            let { label, placeholder, style, required, minLength, maxLength } =
              question;

            const modalQuestion = new TextInputBuilder()
              .setCustomId(`question${questionIndex + 1}`)
              .setLabel(label)
              .setStyle(style)
              .setPlaceholder(placeholder)
              .setRequired(required);

            if (typeof minLength === "number" && minLength > 0) {
              modalQuestion.setMinLength(minLength);
            }

            if (style === "Paragraph") {
              if (
                typeof maxLength !== "number" ||
                maxLength < minLength ||
                maxLength > 1000
              ) {
                maxLength = 1000;
                console.log(
                  `[WARN]: Invalid maxLength value for question ${questionIndex + 1}, falling back to the default 1000`,
                );
              }
              modalQuestion.setMaxLength(maxLength);
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
            flags: MessageFlags.Ephemeral,
          });
        }
        const isEphemeral =
          config.transcriptReplyEmbed.ephemeral !== undefined
            ? config.transcriptReplyEmbed.ephemeral
            : true;
        await interaction.deferReply({
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        });
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
              flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
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
              flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await claimTicket(interaction);
      }

      // Ticket Unclaim button
      if (interaction.customId === "ticketunclaim") {
        if (
          (await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false
        )
          return interaction.reply({
            content: "This ticket has not been claimed!",
            flags: MessageFlags.Ephemeral,
          });
        if (
          (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
          interaction.user.id
        )
          return interaction.reply({
            content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
            flags: MessageFlags.Ephemeral,
          });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await unclaimTicket(interaction);
      }
    } else if (interaction.type === InteractionType.ModalSubmit) {
      const customIds = Object.keys(ticketCategories);

      customIds.forEach(async (customId) => {
        if (interaction.customId === `${customId}-modal`) {
          const category = ticketCategories[customId];

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await createTicket(interaction, category, customId, timeObject);
        }
      });

      for (let i = 1; i <= 5; i++) {
        if (interaction.customId === `${i}-ratingModal`) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await getFeedback(interaction, i);
        }
      }
    }
  },
};
