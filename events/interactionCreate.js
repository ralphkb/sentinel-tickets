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
  saveTranscript,
  mainDB,
  ticketsDB,
  ticketCategories,
  sanitizeInput,
  logMessage,
  saveTranscriptTxt,
  checkSupportRole,
  configEmbed,
  blacklistDB,
  countMessagesInTicket,
  addTicketCreator,
  isBlacklistExpired,
  parseDurationToMilliseconds,
  getUser,
  findAvailableCategory,
} = require("../index.js");
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
        console.error(error);
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "categoryMenu") {
        // Reset the select menu upon selection
        const selectMenuOptions = await mainDB.get("selectMenuOptions");
        await interaction.channel.messages
          .fetch(interaction.message.id)
          .then(async (message) => {
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId("categoryMenu")
              .setPlaceholder(config.menuPlaceholder)
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(selectMenuOptions);

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
        await interaction.deferReply({ ephemeral: true });

        let ticketUserID = await getUser(
          await ticketsDB.get(`${interaction.channel.id}.userID`),
        );
        let attachment;
        const transcriptType = config.transcriptType || "HTML";
        if (transcriptType === "HTML") {
          attachment = await saveTranscript(interaction, null, true);
        } else if (transcriptType === "TXT") {
          attachment = await saveTranscriptTxt(interaction);
        }

        const logDefaultValues = {
          color: "#2FF200",
          title: "Ticket Transcript",
          description: `Saved by {user}`,
          timestamp: true,
          footer: {
            text: `${ticketUserID.tag}`,
            iconURL: `${ticketUserID.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const transcriptEmbed = await configEmbed(
          "transcriptEmbed",
          logDefaultValues,
        );

        if (transcriptEmbed.data && transcriptEmbed.data.description) {
          transcriptEmbed.setDescription(
            transcriptEmbed.data.description.replace(
              /\{user\}/g,
              interaction.user,
            ),
          );
        }

        transcriptEmbed.addFields([
          {
            name: config.transcriptEmbed.field_creator,
            value: `<@!${ticketUserID.id}>\n${sanitizeInput(ticketUserID.tag)}`,
            inline: true,
          },
          {
            name: config.transcriptEmbed.field_ticket,
            value: `<#${interaction.channel.id}>\n${sanitizeInput(interaction.channel.name)}`,
            inline: true,
          },
          {
            name: config.transcriptEmbed.field_category,
            value: `${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
            inline: true,
          },
          {
            name: config.transcriptEmbed.field_creation,
            value: `<t:${await ticketsDB.get(`${interaction.channel.id}.creationTime`)}:F>`,
          },
        ]);

        let logChannelId = config.logs.transcripts || config.logs.default;
        let logChannel = interaction.guild.channels.cache.get(logChannelId);
        await logChannel.send({
          embeds: [transcriptEmbed],
          files: [attachment],
        });
        interaction.followUp({
          content: `Transcript saved to <#${logChannel.id}>`,
          ephemeral: true,
        });
        logMessage(
          `${interaction.user.tag} manually saved the transcript of ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
        );
      }

      // Ticket Re-Open button
      if (interaction.customId === "reOpen") {
        if (config.reOpenStaffOnly) {
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }
        }

        await interaction.deferReply();

        let ticketUserID = await getUser(
          await ticketsDB.get(`${interaction.channel.id}.userID`),
        );
        let ticketChannel = interaction.guild.channels.cache.get(
          interaction.channel.id,
        );
        let ticketButton = await ticketsDB.get(
          `${interaction.channel.id}.button`,
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
          description:
            "This ticket has been re-opened by **{user} ({user.tag})**",
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

        Object.keys(ticketCategories).forEach(async (id) => {
          if (ticketButton === id) {
            const category = ticketCategories[id];
            const categoryIDs = category.categoryID;
            const categoryID = await findAvailableCategory(categoryIDs);

            if (
              !category.categoryID.some(
                (catId) => catId === ticketChannel.parentId,
              )
            ) {
              await ticketChannel.setParent(categoryID, {
                lockPermissions: false,
              });
            }

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
        const usersArray = await Promise.all(
          addedUsers.map(async (userId) => {
            return await getUser(userId);
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
        await interaction.followUp({ embeds: [reopenEmbed] });
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

          const reopenDMEmbed = await configEmbed(
            "reopenDMEmbed",
            defaultDMValues,
          );

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
      }
      // Ticket Delete button
      if (interaction.customId === "deleteTicket") {
        const hasSupportRole = await checkSupportRole(interaction);
        if (!hasSupportRole) {
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }

        await interaction.deferReply();
        const totalMessages = await mainDB.get("totalMessages");
        let attachment;
        if (config.transcriptType === "HTML") {
          attachment = await saveTranscript(interaction);
        } else if (config.transcriptType === "TXT") {
          attachment = await saveTranscriptTxt(interaction);
        }
        let ticketUserID = await getUser(
          await ticketsDB.get(`${interaction.channel.id}.userID`),
        );
        let claimUserID = await ticketsDB.get(
          `${interaction.channel.id}.claimUser`,
        );
        let claimUser;

        if (claimUserID) {
          claimUser = await getUser(claimUserID);
        }

        const logDefaultValues = {
          color: "#FF0000",
          title: "Ticket Logs | Ticket Deleted",
          timestamp: true,
          thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          footer: {
            text: `${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const logDeleteEmbed = await configEmbed(
          "logDeleteEmbed",
          logDefaultValues,
        );

        logDeleteEmbed.addFields([
          {
            name: config.logDeleteEmbed.field_staff,
            value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.logDeleteEmbed.field_user,
            value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
          },
          {
            name: config.logDeleteEmbed.field_ticket,
            value: `> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
          },
          {
            name: config.logDeleteEmbed.field_creation,
            value: `> <t:${await ticketsDB.get(`${interaction.channel.id}.creationTime`)}:F>`,
          },
        ]);

        if (claimUser)
          logDeleteEmbed.addFields({
            name: "• Claimed By",
            value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
          });
        let logChannelId = config.logs.ticketDelete || config.logs.default;
        let logsChannel = interaction.guild.channels.cache.get(logChannelId);
        if (config.toggleLogs.ticketDelete) {
          await logsChannel.send({
            embeds: [logDeleteEmbed],
            files: [attachment],
          });
        }
        logMessage(
          `${interaction.user.tag} deleted the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
        );

        const deleteTicketTime = config.deleteTicketTime || 5;
        const deleteTime = deleteTicketTime * 1000;

        const defaultValues = {
          color: "#FF0000",
          description: "Deleting ticket in {time} seconds",
        };

        const deleteEmbed = await configEmbed("deleteEmbed", defaultValues);

        if (deleteEmbed.data && deleteEmbed.data.description) {
          deleteEmbed.setDescription(
            deleteEmbed.data.description.replace(
              /\{time\}/g,
              `${deleteTicketTime}`,
            ),
          );
        }

        // DM the user with an embed and the transcript of the ticket depending on the enabled settings
        const sendEmbed = config.DMUserSettings.embed;
        const sendTranscript = config.DMUserSettings.transcript;
        if (sendEmbed || sendTranscript) {
          const defaultDMValues = {
            color: "#2FF200",
            title: "Ticket Deleted",
            description:
              "Your support ticket has been deleted. Here is your transcript and other information.",
            thumbnail: interaction.guild.iconURL(),
            timestamp: true,
          };

          const deleteDMEmbed = await configEmbed(
            "deleteDMEmbed",
            defaultDMValues,
          );

          deleteDMEmbed
            .addFields(
              {
                name: "Server",
                value: `> ${interaction.guild.name}`,
                inline: true,
              },
              {
                name: "Ticket",
                value: `> #${sanitizeInput(interaction.channel.name)}`,
                inline: true,
              },
              {
                name: "Category",
                value: `> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
                inline: true,
              },
            )
            .addFields(
              {
                name: "Ticket Author",
                value: `> ${sanitizeInput(ticketUserID.tag)}`,
                inline: true,
              },
              {
                name: "Deleted By",
                value: `> ${sanitizeInput(interaction.user.tag)}`,
                inline: true,
              },
              {
                name: "Claimed By",
                value: `> ${claimUser ? sanitizeInput(claimUser.tag) : "None"}`,
                inline: true,
              },
            )
            .addFields({
              name: "Ticket Creation Time",
              value: `> <t:${await ticketsDB.get(`${interaction.channel.id}.creationTime`)}:F>`,
              inline: true,
            });

          const options = [];
          for (let i = 1; i <= 5; i++) {
            const option = new StringSelectMenuOptionBuilder()
              .setLabel(`${i} ${i > 1 ? "stars" : "star"}`)
              .setEmoji(config.DMUserSettings.ratingSystem.menu.emoji)
              .setValue(`${i}-star`);

            options.push(option);
          }

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("ratingMenu")
            .setPlaceholder(config.DMUserSettings.ratingSystem.menu.placeholder)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options);

          const actionRowMenu = new ActionRowBuilder().addComponents(
            selectMenu,
          );

          const defaultRatingValues = {
            color: "#2FF200",
            title: "Ticket Feedback & Rating",
            description:
              "We value your feedback! Please take a moment to share your thoughts and rate our support system. Your rating can be between 1 and 5 stars by using the select menu below. Thank you for helping us improve.",
          };

          const ratingDMEmbed = await configEmbed(
            "ratingDMEmbed",
            defaultRatingValues,
          );

          ratingDMEmbed.setFooter({
            text: `Ticket: #${interaction.channel.name} | Category: ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
          });

          const messageDM = {};

          if (sendEmbed) {
            messageDM.embeds = [deleteDMEmbed];
          }

          if (sendTranscript) {
            messageDM.files = [attachment];
          }

          try {
            if (config.DMUserSettings.ratingSystem.enabled === false) {
              await ticketUserID.send(messageDM);
            }
            if (config.DMUserSettings.ratingSystem.enabled === true) {
              await mainDB.set(`ratingMenuOptions`, options);
              await ticketUserID.send(messageDM);
              await ticketUserID.send({
                embeds: [ratingDMEmbed],
                components: [actionRowMenu],
              });
            }
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

        const ticketMessages = await countMessagesInTicket(interaction.channel);
        await mainDB.set("totalMessages", totalMessages + ticketMessages);
        await interaction.editReply({ embeds: [deleteEmbed] });

        setTimeout(async () => {
          await ticketsDB.delete(interaction.channel.id);
          await mainDB.pull("openTickets", interaction.channel.id);
          await interaction.channel.delete();
        }, deleteTime);
      }

      //Ticket Close Button
      if (interaction.customId === "closeTicket") {
        if (
          (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
        ) {
          return interaction.reply({
            content: "This ticket is already closed!",
            ephemeral: true,
          });
        }

        if (config.closeStaffOnly) {
          const hasSupportRole = await checkSupportRole(interaction);
          if (!hasSupportRole) {
            return interaction.reply({
              content:
                config.errors.not_allowed || "You are not allowed to use this!",
              ephemeral: true,
            });
          }
        }

        await interaction.deferReply();
        await ticketsDB.set(
          `${interaction.channel.id}.closeUserID`,
          interaction.user.id,
        );
        let ticketUserID = await getUser(
          await ticketsDB.get(`${interaction.channel.id}.userID`),
        );
        let claimUserID = await ticketsDB.get(
          `${interaction.channel.id}.claimUser`,
        );
        let claimUser;

        if (claimUserID) {
          claimUser = await getUser(claimUserID);
        }
        let ticketButton = await ticketsDB.get(
          `${interaction.channel.id}.button`,
        );

        const logDefaultValues = {
          color: "#FF2400",
          title: "Ticket Logs | Ticket Closed",
          timestamp: true,
          thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          footer: {
            text: `${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const logCloseEmbed = await configEmbed(
          "logCloseEmbed",
          logDefaultValues,
        );

        logCloseEmbed.addFields([
          {
            name: config.logCloseEmbed.field_staff,
            value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.logCloseEmbed.field_user,
            value: `> <@!${ticketUserID.id}>\n> ${sanitizeInput(ticketUserID.tag)}`,
          },
          {
            name: config.logCloseEmbed.field_ticket,
            value: `> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
          },
        ]);

        if (claimUser) {
          logCloseEmbed.addFields({
            name: "• Claimed By",
            value: `> <@!${claimUser.id}>\n> ${sanitizeInput(claimUser.tag)}`,
          });
        }
        let logChannelId = config.logs.ticketClose || config.logs.default;
        let logsChannel = interaction.guild.channels.cache.get(logChannelId);
        if (config.toggleLogs.ticketClose) {
          await logsChannel.send({ embeds: [logCloseEmbed] });
        }
        logMessage(
          `${interaction.user.tag} closed the ticket #${interaction.channel.name} which was created by ${ticketUserID.tag}`,
        );

        const reOpenButton = new ButtonBuilder()
          .setCustomId("reOpen")
          .setLabel(config.reOpenButton.label)
          .setEmoji(config.reOpenButton.emoji)
          .setStyle(ButtonStyle[config.reOpenButton.style]);

        const transcriptButton = new ButtonBuilder()
          .setCustomId("createTranscript")
          .setLabel(config.transcriptButton.label)
          .setEmoji(config.transcriptButton.emoji)
          .setStyle(ButtonStyle[config.transcriptButton.style]);

        const deleteButton = new ButtonBuilder()
          .setCustomId("deleteTicket")
          .setLabel(config.deleteButton.label)
          .setEmoji(config.deleteButton.emoji)
          .setStyle(ButtonStyle[config.deleteButton.style]);

        let row = new ActionRowBuilder().addComponents(
          reOpenButton,
          transcriptButton,
          deleteButton,
        );

        const defaultValues = {
          color: "#FF2400",
          title: "Ticket Closed",
          description: "This ticket was closed by **{user} ({user.tag})**",
          timestamp: true,
          footer: {
            text: `${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const closeEmbed = await configEmbed("closeEmbed", defaultValues);

        if (closeEmbed.data && closeEmbed.data.description) {
          closeEmbed.setDescription(
            closeEmbed.data.description
              .replace(/\{user\}/g, `${interaction.user}`)
              .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)),
          );
        }

        await interaction.channel.permissionOverwrites.edit(ticketUserID, {
          SendMessages: false,
          ViewChannel: true,
        });

        if (claimUser) {
          await interaction.channel.permissionOverwrites.edit(claimUser, {
            SendMessages: false,
            ViewChannel: true,
          });
        }

        const addedUsers =
          (await ticketsDB.get(`${interaction.channel.id}.addedUsers`)) || [];
        const usersArray = await Promise.all(
          addedUsers.map(async (userId) => {
            return await getUser(userId);
          }),
        );

        try {
          for (const member of usersArray) {
            await interaction.channel.permissionOverwrites.edit(member, {
              SendMessages: false,
              ViewChannel: true,
            });
          }
        } catch (error) {
          console.error(
            "An error occurred while editing permission overwrites on closing a ticket:",
            error,
          );
        }

        let messageID;
        await interaction
          .editReply({
            embeds: [closeEmbed],
            components: [row],
            fetchReply: true,
          })
          .then(async function (message) {
            messageID = message.id;
          });
        await ticketsDB.set(`${interaction.channel.id}.closeMsgID`, messageID);
        await ticketsDB.set(`${interaction.channel.id}.status`, "Closed");
        await mainDB.pull("openTickets", interaction.channel.id);
        if (config.closeRemoveUser) {
          interaction.channel.permissionOverwrites.delete(ticketUserID);
        }
        if (
          config.closeDMEmbed.enabled &&
          interaction.user.id !== ticketUserID.id
        ) {
          const defaultDMValues = {
            color: "#FF0000",
            title: "Ticket Closed",
            description:
              "Your ticket **#{ticketName}** has been closed by {user} in **{server}**.",
          };

          const closeDMEmbed = await configEmbed(
            "closeDMEmbed",
            defaultDMValues,
          );

          if (closeDMEmbed.data && closeDMEmbed.data.description) {
            closeDMEmbed.setDescription(
              closeDMEmbed.data.description
                .replace(/\{ticketName\}/g, `${interaction.channel.name}`)
                .replace(/\{user\}/g, `<@!${interaction.user.id}>`)
                .replace(/\{server\}/g, `${interaction.guild.name}`),
            );
          }

          try {
            await ticketUserID.send({ embeds: [closeDMEmbed] });
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

        Object.keys(ticketCategories).forEach(async (id) => {
          if (ticketButton === id) {
            const category = ticketCategories[id];
            const categoryIDs = category.closedCategoryID;
            const closedCategoryID = await findAvailableCategory(categoryIDs);
            await interaction.channel.setParent(closedCategoryID, {
              lockPermissions: false,
            });

            category.support_role_ids.forEach(async (roleId) => {
              await interaction.channel.permissionOverwrites
                .edit(roleId, {
                  SendMessages: false,
                  ViewChannel: true,
                })
                .catch((error) => {
                  console.error(
                    `Error updating permissions of support roles:`,
                    error,
                  );
                });
            });
          }
        });
      }

      // Ticket Claim button
      if (interaction.customId === "ticketclaim") {
        const isClaimInProgress = await mainDB.get("isClaimInProgress");
        if (isClaimInProgress) {
          return interaction.reply({
            content: "Another user is already claiming this ticket.",
            ephemeral: true,
          });
        }

        await mainDB.set("isClaimInProgress", true);
        const hasSupportRole = await checkSupportRole(interaction);
        if (!hasSupportRole) {
          await mainDB.set("isClaimInProgress", false);
          return interaction.reply({
            content:
              config.errors.not_allowed || "You are not allowed to use this!",
            ephemeral: true,
          });
        }

        if (
          (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
        ) {
          await mainDB.set("isClaimInProgress", false);
          return interaction.reply({
            content: "You cannot claim a closed ticket!",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });
        const totalClaims = await mainDB.get("totalClaims");

        const defaultValues = {
          color: "#2FF200",
          title: "Ticket Claimed",
          description: `This ticket has been claimed by {user}.\nThey will be assisting you shortly!`,
          timestamp: true,
          footer: {
            text: `Claimed by ${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const claimedEmbed = await configEmbed("claimedEmbed", defaultValues);

        if (claimedEmbed.data && claimedEmbed.data.description) {
          claimedEmbed.setDescription(
            claimedEmbed.data.description.replace(
              /\{user\}/g,
              interaction.user,
            ),
          );
        }

        await interaction.editReply({
          content: "You successfully claimed this ticket!",
          ephemeral: true,
        });
        interaction.channel.send({ embeds: [claimedEmbed], ephemeral: false });

        interaction.channel.messages
          .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
          .then(async (message) => {
            const embed = message.embeds[0];
            const claimedByField = {
              name: "Claimed by",
              value: `> <@!${interaction.user.id}> (${sanitizeInput(interaction.user.tag)})`,
            };
            embed.fields.push(claimedByField);

            const closeButton = new ButtonBuilder()
              .setCustomId("closeTicket")
              .setLabel(config.closeButton.label)
              .setEmoji(config.closeButton.emoji)
              .setStyle(ButtonStyle[config.closeButton.style]);

            const claimButton = new ButtonBuilder()
              .setCustomId("ticketclaim")
              .setLabel(config.claimButton.label)
              .setEmoji(config.claimButton.emoji)
              .setStyle(ButtonStyle[config.claimButton.style])
              .setDisabled(true);

            const unClaimButton = new ButtonBuilder()
              .setCustomId("ticketunclaim")
              .setLabel(config.unclaimButton.label)
              .setEmoji(config.unclaimButton.emoji)
              .setStyle(ButtonStyle[config.unclaimButton.style]);

            let actionRow2 = new ActionRowBuilder().addComponents(
              closeButton,
              claimButton,
              unClaimButton,
            );
            message.edit({ embeds: [embed], components: [actionRow2] });

            let ticketButton = await ticketsDB.get(
              `${interaction.channel.id}.button`,
            );

            if (config.claimRename) {
              let claimRenameName =
                config.claimRenameName || "{category}-{username}";
              const category = ticketCategories[ticketButton];
              const claimUsername = interaction.user.username;
              const claimDisplayname = interaction.user.displayName;

              claimRenameName = claimRenameName
                .replace(/\{category\}/g, category.name)
                .replace(/\{username\}/g, claimUsername)
                .replace(/\{displayname\}/g, claimDisplayname);

              await interaction.channel.setName(claimRenameName);
            }

            if (config.claim1on1) {
              Object.keys(ticketCategories).forEach(async (id) => {
                if (ticketButton === id) {
                  ticketCategories[id].support_role_ids.forEach(
                    async (roleId) => {
                      await interaction.channel.permissionOverwrites
                        .edit(roleId, {
                          SendMessages: false,
                          ViewChannel: true,
                        })
                        .catch((error) => {
                          console.error(`Error updating permissions:`, error);
                        });
                    },
                  );
                }
              });
            }

            await interaction.channel.permissionOverwrites.edit(
              interaction.user,
              {
                SendMessages: true,
                ViewChannel: true,
                AttachFiles: true,
                EmbedLinks: true,
                ReadMessageHistory: true,
              },
            );

            await ticketsDB.set(`${interaction.channel.id}.claimed`, true);
            await ticketsDB.set(
              `${interaction.channel.id}.claimUser`,
              interaction.user.id,
            );
            await mainDB.set("totalClaims", totalClaims + 1);
            await mainDB.set("isClaimInProgress", false);

            let logChannelId = config.logs.ticketClaim || config.logs.default;
            let logsChannel =
              interaction.guild.channels.cache.get(logChannelId);

            const logDefaultValues = {
              color: "#2FF200",
              title: "Ticket Logs | Ticket Claimed",
              timestamp: true,
              thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              footer: {
                text: `${interaction.user.tag}`,
                iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              },
            };

            const logClaimedEmbed = await configEmbed(
              "logClaimedEmbed",
              logDefaultValues,
            );

            logClaimedEmbed.addFields([
              {
                name: config.logClaimedEmbed.field_staff,
                value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
              },
              {
                name: config.logClaimedEmbed.field_ticket,
                value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
              },
            ]);

            if (config.toggleLogs.ticketClaim) {
              await logsChannel.send({ embeds: [logClaimedEmbed] });
            }
            logMessage(
              `${interaction.user.tag} claimed the ticket #${interaction.channel.name}`,
            );
          });
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
        const totalClaims = await mainDB.get("totalClaims");
        let ticketButton = await ticketsDB.get(
          `${interaction.channel.id}.button`,
        );

        Object.keys(ticketCategories).forEach(async (id) => {
          if (ticketButton === id) {
            ticketCategories[id].support_role_ids.forEach(async (roleId) => {
              await interaction.channel.permissionOverwrites
                .edit(roleId, {
                  SendMessages: true,
                  ViewChannel: true,
                })
                .catch((error) => {
                  console.error(`Error updating permissions:`, error);
                });
            });
          }
        });

        const defaultValues = {
          color: "#FF2400",
          title: "Ticket Unclaimed",
          description: `This ticket has been unclaimed by {user}.`,
          timestamp: true,
          footer: {
            text: `Unclaimed by ${interaction.user.tag}`,
            iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
          },
        };

        const unclaimedEmbed = await configEmbed(
          "unclaimedEmbed",
          defaultValues,
        );

        if (unclaimedEmbed.data && unclaimedEmbed.data.description) {
          unclaimedEmbed.setDescription(
            unclaimedEmbed.data.description.replace(
              /\{user\}/g,
              interaction.user,
            ),
          );
        }

        await interaction.editReply({
          content: "You successfully unclaimed this ticket!",
          ephemeral: true,
        });
        interaction.channel.permissionOverwrites.delete(interaction.user);
        interaction.channel.send({ embeds: [unclaimedEmbed] });

        interaction.channel.messages
          .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
          .then(async (message) => {
            const embed = message.embeds[0];
            embed.fields.pop();

            const closeButton = new ButtonBuilder()
              .setCustomId("closeTicket")
              .setLabel(config.closeButton.label)
              .setEmoji(config.closeButton.emoji)
              .setStyle(ButtonStyle[config.closeButton.style]);

            const claimButton = new ButtonBuilder()
              .setCustomId("ticketclaim")
              .setLabel(config.claimButton.label)
              .setEmoji(config.claimButton.emoji)
              .setStyle(ButtonStyle[config.claimButton.style]);

            let actionRow3 = new ActionRowBuilder().addComponents(
              closeButton,
              claimButton,
            );

            message.edit({ embeds: [embed], components: [actionRow3] });

            await ticketsDB.set(`${interaction.channel.id}.claimed`, false);
            await ticketsDB.set(`${interaction.channel.id}.claimUser`, "");

            let logChannelId = config.logs.ticketUnclaim || config.logs.default;
            let logsChannel =
              interaction.guild.channels.cache.get(logChannelId);

            const logDefaultValues = {
              color: "#FF2400",
              title: "Ticket Logs | Ticket Unclaimed",
              timestamp: true,
              thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              footer: {
                text: `${interaction.user.tag}`,
                iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
              },
            };

            const logUnclaimedEmbed = await configEmbed(
              "logUnclaimedEmbed",
              logDefaultValues,
            );

            logUnclaimedEmbed.addFields([
              {
                name: config.logUnclaimedEmbed.field_staff,
                value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
              },
              {
                name: config.logUnclaimedEmbed.field_staff,
                value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
              },
            ]);

            if (config.toggleLogs.ticketUnclaim) {
              await logsChannel.send({ embeds: [logUnclaimedEmbed] });
            }
            await mainDB.set("totalClaims", totalClaims - 1);
            logMessage(
              `${interaction.user.tag} unclaimed the ticket #${interaction.channel.name}`,
            );
          });
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
            const value = interaction.fields.getTextInputValue(
              `question${questionIndex + 1}`,
            );

            ticketOpenEmbed.addFields({
              name: `${label}`,
              value: `>>> ${value}`,
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
          const closeButton = new ButtonBuilder()
            .setCustomId("closeTicket")
            .setLabel(config.closeButton.label)
            .setEmoji(config.closeButton.emoji)
            .setStyle(ButtonStyle[config.closeButton.style]);

          const answerRow = new ActionRowBuilder().addComponents(closeButton);

          if (config.claimFeature) {
            const claimButton = new ButtonBuilder()
              .setCustomId("ticketclaim")
              .setLabel(config.claimButton.label)
              .setEmoji(config.claimButton.emoji)
              .setStyle(ButtonStyle[config.claimButton.style]);

            answerRow.addComponents(claimButton);
          }

          try {
            const TICKETCOUNT = await mainDB.get("totalTickets");
            const USERNAME = interaction.user.username;
            const configValue = category.ticketName;
            const categoryIDs = category.categoryID;
            const selectedCategoryID = await findAvailableCategory(categoryIDs);

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
                    allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.EmbedLinks,
                      PermissionFlagsBits.AttachFiles,
                      PermissionFlagsBits.ReadMessageHistory,
                    ],
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
                    allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.EmbedLinks,
                      PermissionFlagsBits.AttachFiles,
                      PermissionFlagsBits.ReadMessageHistory,
                    ],
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
                    let logChannel =
                      interaction.guild.channels.cache.get(logChannelId);
                    if (config.toggleLogs.ticketCreate) {
                      await logChannel.send({
                        embeds: [logTicketOpenEmbed],
                      });
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
          let logChannel = client.channels.cache.get(logChannelId);
          if (config.toggleLogs.ticketFeedback) {
            await logChannel.send({ embeds: [logRatingEmbed] });
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
