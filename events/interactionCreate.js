const { Events, Collection, InteractionType, EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { client, saveTranscript } = require('../index.js');
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);
const { mainDB, ticketsDB, ticketCategories } = require('../index.js');
const buttonCooldown = new Map();

module.exports = {
	name: Events.InteractionCreate,
    async execute(interaction) {

        if (interaction.isChatInputCommand()) {

            const command = client.commands.get(interaction.commandName);
        
            if (!command) return;
        
            const { cooldowns } = client;
        
            if (!cooldowns.has(command.data.name)) {
                cooldowns.set(command.data.name, new Collection());
            }
        
            const now = Date.now();
            const timestamps = cooldowns.get(command.data.name);
            const defaultCooldownDuration = config.commands_cooldown;
            const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;
        
            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
                if (now < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1000);
                    return interaction.reply({ content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, ephemeral: true });
                }
            }
        
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
        
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
          } else if (interaction.isStringSelectMenu()) {

            // Select menus to be added in the future

         } else if (interaction.isButton()) {

            const blacklistedUsers = await mainDB.get('blacklistedUsers');
            if (blacklistedUsers.includes(interaction.user.id)) {
              return interaction.reply({ content: config.errors.blacklisted, ephemeral: true });
            }

            const cooldown = config.buttons_cooldown * 1000;
            const cooldownEnd = cooldown - (Date.now() - buttonCooldown.get(interaction.user.id));

              const timeReadable = Math.floor(cooldownEnd / 1000);
              const cooldownEmbed = new EmbedBuilder()
                .setTitle(config.cooldownEmbed.title)
                .setColor(config.cooldownEmbed.color)
                .setDescription(`You have to wait **${timeReadable}** seconds before clicking this button!`)
                .setDescription(`${config.cooldownEmbed.description}`.replace(/\{time\}/g, `${timeReadable}`))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
                .setTimestamp();
            
             if(buttonCooldown.has(interaction.user.id)) return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
    
            let maxOpenTickets = config.maxOpenTickets
            let currentlyOpenTickets = 0
            let ticketAlreadyOpened = new EmbedBuilder()
            .setTitle(config.maxOpenTicketsEmbed.title)
            .setColor(config.maxOpenTicketsEmbed.color)
            .setDescription(`${config.maxOpenTicketsEmbed.description}`.replace(/\{max\}/g, `${maxOpenTickets}`))
            .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
            .setTimestamp();
    
            await interaction.guild.channels.cache.forEach(async channel => {
                if(await ticketsDB.has(channel.id)) {
                const { userID } = await ticketsDB.get(channel.id);
                if(userID && userID === interaction.user.id && await ticketsDB.get(`${channel.id}.status`) !== "Closed") {
                currentlyOpenTickets++
                }
            }
            });
    
            if (currentlyOpenTickets >= maxOpenTickets) {
                return interaction.reply({ embeds: [ticketAlreadyOpened], ephemeral: true }).then(() => {
                  currentlyOpenTickets = 0;
                });
              }

              const customIds = Object.keys(ticketCategories);

              customIds.forEach(async (customId) => {
                if (interaction.customId === customId) {

                    buttonCooldown.set(interaction.user.id, Date.now());
                    setTimeout(() => buttonCooldown.delete(interaction.user.id), cooldown);
                    const category = ticketCategories[customId];

                    const modal = new ModalBuilder()
                    .setCustomId(`${customId}-modal`)
                    .setTitle(category.modalTitle);

                    const modalQuestions = [];
                    const actionRows =[];
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

                          if (style === 'Paragraph') {
                            modalQuestion.setMaxLength(1000);
                        }
                      
                        modalQuestions.push(modalQuestion);
                        questionIndex++;
                      });


                      modalQuestions.forEach(question => {
                        const actionRow = new ActionRowBuilder().addComponents(question);
                        actionRows.push(actionRow);
                      });

                      actionRows.forEach(actionRow => {
                        modal.addComponents(actionRow);
                      });

                      await interaction.showModal(modal);

                }
              });

              // Ticket Transcript button
              if (interaction.customId === 'createTranscript') {

                if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
                    return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
                  };

                  let ticketUserID = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.userID`));
                  let attachment = await saveTranscript(interaction);

                  const embed = new EmbedBuilder()
                  .setColor(config.default_embed_color)
                  .setTitle("Ticket Transcript")
                  .setDescription(`Saved by <@!${interaction.user.id}>`)
                  .addFields([
                      { name: "Ticket Creator", value: `<@!${ticketUserID.id}>\n${ticketUserID.tag}`, inline: true },
                      { name: "Ticket Name", value: `<#${interaction.channel.id}>\n${interaction.channel.name}`, inline: true },
                      { name: "Category", value: `${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`, inline: true },
                    ])
                  .setFooter({ text: `${ticketUserID.tag}`, iconURL: `${ticketUserID.displayAvatarURL({ dynamic: true })}` })
                  .setTimestamp()

                  let transcriptChannel = interaction.guild.channels.cache.get(config.transcripts_channel_id);
                  transcriptChannel.send({ embeds: [embed], files: [attachment] })
                  interaction.reply({ content: `Transcript saved to <#${transcriptChannel.id}>`, ephemeral: true })

              }

              // Ticket Re-Open button
              if (interaction.customId === 'reOpen') {
                await interaction.deferReply();

                let ticketUserID = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.userID`));
                let ticketChannel = interaction.guild.channels.cache.get(interaction.channel.id);
                let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

                const logEmbed = new EmbedBuilder()
                .setColor(config.default_embed_color)
                .setTitle('Ticket Logs | Ticket Re-Opened')
                .addFields([
                    { name: '• Re-Opened By', value: `> <@!${interaction.user.id}>\n> ${interaction.user.tag}` },
                    { name: '• Ticket Creator', value: `> <@!${ticketUserID.id}>\n> ${ticketUserID.tag}` },
                    { name: '• Ticket', value: `> #${interaction.channel.name}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}` },
                 ])
                .setTimestamp()
                .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })

                let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
                await logsChannel.send({ embeds: [logEmbed]});

                const embed = new EmbedBuilder()
                .setColor(config.default_embed_color)
                .setDescription(`This ticket has been re-opened by <@!${interaction.user.id}> (${interaction.user.tag})`)

                Object.keys(ticketCategories).forEach(async (id) => {
                    if (ticketButton === id) {
                    const category = ticketCategories[id];
                  
                    if (category.closedCategoryID && ticketChannel.parentId !== category.categoryID) {
                      await ticketChannel.setParent(category.categoryID, { lockPermissions: false });
                    }
                  
                    config.support_role_ids.forEach(async (roleId) => {
                      await interaction.channel.permissionOverwrites.create(roleId, {
                        'ViewChannel': true,
                        'SendMessages': true,
                        'AttachFiles': true,
                        'EmbedLinks': true,
                        'ReadMessageHistory': true
                      });
                    });
                }
               });

               let claimUser = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.claimUser`));
               await interaction.channel.permissionOverwrites.create(ticketUserID.id, { 'ViewChannel': true, 'SendMessages': true, 'AttachFiles': true, 'EmbedLinks': true, 'ReadMessageHistory': true });
               if(claimUser) await interaction.channel.permissionOverwrites.create(claimUser.id, { 'ViewChannel': true, 'SendMessages': true, 'AttachFiles': true, 'EmbedLinks': true, 'ReadMessageHistory': true });

               await interaction.channel.messages.fetch(await ticketsDB.get(`${interaction.channel.id}.closeMsgID`)).then(msg => msg.delete());
               await ticketsDB.set(`${interaction.channel.id}.status`, "Open");
               await mainDB.push('openTickets', interaction.channel.id);
               await interaction.followUp({ embeds: [embed] });

              }
              // Ticket Delete button
              if (interaction.customId === 'deleteTicket') {

                if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
                    return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
                  };
                  
                await interaction.channel.messages.fetch(await ticketsDB.get(`${interaction.channel.id}.closeMsgID`)).then(msg => msg.delete());
                await interaction.deferReply();
                let attachment = await saveTranscript(interaction);
                let ticketUserID = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.userID`));
                let claimUser = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.claimUser`));

                const logEmbed = new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle('Ticket Logs | Ticket Deleted')
                .addFields([
                    { name: '• Deleted By', value: `> <@!${interaction.user.id}>\n> ${interaction.user.tag}` },
                    { name: '• Ticket Creator', value: `> <@!${ticketUserID.id}>\n> ${ticketUserID.tag}` },
                    { name: '• Ticket', value: `> #${interaction.channel.name}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}` },
                 ])
                .setTimestamp()
                .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
        
                if (claimUser) logEmbed.addFields({ name: '• Claimed By', value: `> <@!${claimUser.id}>\n> ${claimUser.tag}` });
                let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
                await logsChannel.send({ embeds: [logEmbed], files: [attachment] });

                const deleteTicketTime = config.deleteTicketTime;
                const deleteTime = deleteTicketTime * 1000;
                
                const deleteEmbed = new EmbedBuilder()
                  .setColor(config.commands.delete.embed.color)
                  .setDescription(`${config.commands.delete.embed.description}`.replace(/\{time\}/g, `${deleteTicketTime}`));
                
                await interaction.followUp({ embeds: [deleteEmbed] });
                
                setTimeout(async () => {
                  await ticketsDB.delete(interaction.channel.id);
                  await mainDB.pull('openTickets', interaction.channel.id);
                  await interaction.channel.delete();
                }, deleteTime);

              }

              //Ticket Close Button
              if (interaction.customId === 'closeTicket') {

                await ticketsDB.set(`${interaction.channel.id}.closeUserID`, interaction.user.id);

                if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
                    return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
                  };

                let ticketUserID = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.userID`));
                let claimUser = client.users.cache.get(await ticketsDB.get(`${interaction.channel.id}.claimUser`));
                let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

                const logEmbed = new EmbedBuilder()
                .setColor("#FF2400")
                .setTitle('Ticket Logs | Ticket Closed')
                .addFields([
                    { name: '• Closed By', value: `> <@!${interaction.user.id}>\n> ${interaction.user.tag}` },
                    { name: '• Ticket Creator', value: `> <@!${ticketUserID.id}>\n> ${ticketUserID.tag}` },
                    { name: '• Ticket', value: `> #${interaction.channel.name}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}` },
                 ])
                .setTimestamp()
                .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
        
                if (claimUser) logEmbed.addFields({ name: '• Claimed By', value: `> <@!${claimUser.id}>\n> ${claimUser.tag}` });
                let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
                await logsChannel.send({ embeds: [logEmbed]});

                const reOpenButton = new ButtonBuilder()
                .setCustomId('reOpen')
                .setLabel(config.reOpenButton.label)
                .setEmoji(config.reOpenButton.emoji)
                .setStyle(ButtonStyle[config.reOpenButton.style])
        
                const transcriptButton = new ButtonBuilder()
                .setCustomId('createTranscript')
                .setLabel(config.transcriptButton.label)
                .setEmoji(config.transcriptButton.emoji)
                .setStyle(ButtonStyle[config.transcriptButton.style])
            
                const deleteButton = new ButtonBuilder()
                .setCustomId('deleteTicket')
                .setLabel(config.deleteButton.label)
                .setEmoji(config.deleteButton.emoji)
                .setStyle(ButtonStyle[config.deleteButton.style])

                let row = new ActionRowBuilder().addComponents(reOpenButton, transcriptButton, deleteButton);

                const embed = new EmbedBuilder()
                .setColor(config.commands.close.embed.color)
                .setTitle(config.commands.close.embed.title)
                .setDescription(config.commands.close.embed.description.replace(/\{user\}/g, `${interaction.user}`).replace(/\{user\.tag\}/g, `${interaction.user.tag}`))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ dynamic: true })}` })
                .setTimestamp()

                await interaction.channel.members.forEach(member => {
                    if (member.id !== client.user.id) {
                      interaction.channel.permissionOverwrites.edit(member, {
                        'SendMessages': false,
                        'ViewChannel': true
                      }).catch(console.error);
                    }
                  });

                  let messageID;    
                  await interaction.reply({ embeds: [embed], components: [row], fetchReply: true }).then(async function(message) { messageID = message.id })
                  await ticketsDB.set(`${interaction.channel.id}.closeMsgID`, messageID);
                  await ticketsDB.set(`${interaction.channel.id}.status`, "Closed");
                  await mainDB.pull('openTickets', interaction.channel.id);

                  Object.keys(ticketCategories).forEach(async (id) => {
                    if (ticketButton === id) {
                      const category = ticketCategories[id];
                      await interaction.channel.setParent(category.closedCategoryID, { lockPermissions: false });
                  
                      config.support_role_ids.forEach(async (roleId) => {
                        await interaction.channel.permissionOverwrites.edit(roleId, {
                          'SendMessages': false,
                          'ViewChannel': true
                        }).catch((error) => {
                          console.error(`Error updating permissions of support roles:`, error);
                        });
                      });
                    }
                  });

              }

              // Ticket Claim button
              if(interaction.customId === 'ticketclaim') {
                await interaction.deferReply({ ephemeral: true });

                if (!interaction.member.roles.cache.some((role) => config.support_role_ids.includes(role.id))) {
                    return interaction.reply({ content: config.errors.not_allowed, ephemeral: true });
                  };

                  const embed = new EmbedBuilder()
                  .setTitle("Ticket Claimed")
                  .setColor(config.default_embed_color)
                  .setDescription(`This ticket has been claimed by <@!${interaction.user.id}>\nThey will be assisting you shortly!`)
                  .setTimestamp()
                  .setFooter({ text: `Claimed by ${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ dynamic: true })}` })
                  interaction.editReply({ content: "You successfully claimed this ticket!", ephemeral: true});
                  interaction.channel.send({ embeds: [embed], ephemeral: false });

                  interaction.channel.messages.fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`)).then(async message => {

                    const embed = message.embeds[0]
                    embed.fields[embed.fields.length - 1] = { name: "Claimed by", value: `> <@!${interaction.user.id}> (${interaction.user.tag})` }
              
                    const closeButton = new ButtonBuilder()
                    .setCustomId('closeTicket')
                    .setLabel(config.closeButton.label)
                    .setEmoji(config.closeButton.emoji)
                    .setStyle(ButtonStyle[config.closeButton.style])
              
                    const claimButton = new ButtonBuilder()
                    .setCustomId('ticketclaim')
                    .setLabel("Claim (Staff Only)")
                    .setEmoji('👋')
                    .setStyle(ButtonStyle.Success)  
                    .setDisabled(true)
              
                    const unClaimButton = new ButtonBuilder()
                    .setCustomId('ticketunclaim')
                    .setLabel("Unclaim (Staff Only)")
                    .setStyle(ButtonStyle.Danger)
              
                    let actionRow2 = new ActionRowBuilder().addComponents(closeButton, claimButton, unClaimButton);
                    message.edit({ embeds: [embed], components: [actionRow2] });
              
                    let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

                    Object.keys(ticketCategories).forEach(async (id) => {
                        if (ticketButton === id) {

                          config.support_role_ids.forEach(async (roleId) => {
                            await interaction.channel.permissionOverwrites.edit(roleId, {
                              'SendMessages': true,
                              'ViewChannel': true
                            }).catch((error) => {
                              console.error(`Error updating permissions:`, error);
                            });
                          });
                        }
                      });
              
                    await interaction.channel.permissionOverwrites.edit(interaction.user, {
                        'SendMessages': true,
                        'ViewChannel': true,
                        'AttachFiles': true,
                        'EmbedLinks': true,
                        'ReadMessageHistory': true
                    })

                await ticketsDB.set(`${interaction.channel.id}.claimed`, true);
                await ticketsDB.set(`${interaction.channel.id}.claimUser`, interaction.user.id);
              
                let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
              
                const logEmbed = new EmbedBuilder()
                .setColor(config.default_embed_color)
                .setTitle("Ticket Logs | Ticket Claimed")
                .addFields([
                    { name: "• Executor", value: `> <@!${interaction.user.id}>\n> ${interaction.user.tag}` },
                    { name: "• Ticket", value: `> <#${interaction.channel.id}>\n> #${interaction.channel.name}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}` },
                  ])
                .setTimestamp()
                .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
                logsChannel.send({ embeds: [logEmbed] })
              
                })

              }

              // Ticket Unclaim button
              if(interaction.customId === 'ticketunclaim') {
                await interaction.deferReply({ ephemeral: true });

                if (await ticketsDB.get(`${interaction.channel.id}.claimed`) === false) return interaction.editReply({ content: "This ticket has not been claimed!", ephemeral: true });
                if (await ticketsDB.get(`${interaction.channel.id}.claimUser`) !== interaction.user.id) return interaction.editReply({ content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`, ephemeral: true  });

                let ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);

                Object.keys(ticketCategories).forEach(async (id) => {
                    if (ticketButton === id) {

                      config.support_role_ids.forEach(async (roleId) => {
                        await interaction.channel.permissionOverwrites.edit(roleId, {
                          'SendMessages': true,
                          'ViewChannel': true
                        }).catch((error) => {
                          console.error(`Error updating permissions:`, error);
                        });
                      });
                    }
                  });

                  const embed = new EmbedBuilder()
                  .setTitle("Ticket Unclaimed")
                  .setColor("#FF2400")
                  .setDescription(`This ticket has been unclaimed by <@!${interaction.user.id}>`)
                  .setTimestamp()
                  .setFooter({ text: `Unclaimed by ${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ dynamic: true })}` })
                  interaction.editReply({ content: "You successfully unclaimed this ticket!", ephemeral: true })
                  interaction.channel.send({ embeds: [embed] })

                  interaction.channel.messages.fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`)).then(async message => {
  
                    const embed = message.embeds[0]
                    embed.fields[embed.fields.length - 1] = { name: "Claimed by", value: "> This ticket has not been claimed!" }
          
                    const closeButton = new ButtonBuilder()
                    .setCustomId('closeTicket')
                    .setLabel(config.closeButton.label)
                    .setEmoji(config.closeButton.emoji)
                    .setStyle(ButtonStyle[config.closeButton.style])
              
                    const claimButton = new ButtonBuilder()
                    .setCustomId('ticketclaim')
                    .setLabel("Claim (Staff Only)")
                    .setEmoji('👋')
                    .setStyle(ButtonStyle.Success)
            
                    let actionRow3 = new ActionRowBuilder().addComponents(closeButton, claimButton);
            
                    message.edit({ embeds: [embed], components: [actionRow3] });

                await ticketsDB.set(`${interaction.channel.id}.claimed`, false);
                await ticketsDB.set(`${interaction.channel.id}.claimUser`, "");
          
                let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
          
                const logEmbed = new EmbedBuilder()
                .setColor("#FF2400")
                .setTitle("Ticket Logs | Ticket Unclaimed")
                .addFields([
                    { name: "• Executor", value: `> <@!${interaction.user.id}>\n> ${interaction.user.tag}` },
                    { name: "• Ticket", value: `> <#${interaction.channel.id}>\n> #${interaction.channel.name}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}` },
                  ])
                .setTimestamp()
                .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
                .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
                logsChannel.send({ embeds: [logEmbed] })
                })

              }


         } else if (interaction.type === InteractionType.ModalSubmit) {

            const customIds = Object.keys(ticketCategories);

            customIds.forEach(async (customId) => {
              if (interaction.customId === `${customId}-modal`) {
                const category = ticketCategories[customId];

                await interaction.deferReply({ ephemeral: true });
                const openedEmbed = new EmbedBuilder()
                .setColor(category.color)
                .setAuthor({ name: `${category.embedTitle}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
                .setThumbnail(`${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}`)
                .setDescription(category.description)
                .setFooter({ text: config.commands.panel.embed.footer_msg, iconURL: config.commands.panel.embed.footer_icon_url })
                .setTimestamp()

                for (let questionIndex = 0; questionIndex < category.questions.length; questionIndex++) {
                  const question = category.questions[questionIndex];
                  const { label } = question;
                  const value = interaction.fields.getTextInputValue(`question${questionIndex + 1}`);
                
                  openedEmbed.addFields({ name: `${label}`, value: `>>> ${value}` });
                }

                const closeButton = new ButtonBuilder()
                .setCustomId('closeTicket')
                .setLabel(config.closeButton.label)
                .setEmoji(config.closeButton.emoji)
                .setStyle(ButtonStyle[config.closeButton.style])

                const answerRow = new ActionRowBuilder().addComponents(closeButton);
          
                if (config.claimButton) {
                  const claimButton = new ButtonBuilder()
                    .setCustomId('ticketclaim')
                    .setLabel("Claim (Staff Only)")
                    .setEmoji('👋')
                    .setStyle(ButtonStyle.Success);
                
                  answerRow.addComponents(claimButton);
                }

                try {
                    const TICKETCOUNT = await mainDB.get('totalTickets');
                    const USERNAME = interaction.user.username;
                    const ticketType = await ticketsDB.get(`${interaction.channel.id}.ticketType`);
                    const configValue = category.ticketName;

                    let channelName;
                    if (configValue === 'USERNAME') {
                      channelName = `${category.name}-${USERNAME}`;
                    } else if (configValue === 'TICKETCOUNT') {
                      channelName = `${category.name}-${TICKETCOUNT}`;
                    }
  
                    await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category.categoryID,
                    topic: `Ticket Creator: ${interaction.user.tag} | Ticket Type: ${ticketType}`,
                    permissionOverwrites: [
                        {
                          id: interaction.guild.id,
                          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                        },
                        {
                          id: interaction.user.id,
                          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
                        },
                        {
                          id: process.env.CLIENT_ID,
                          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                        },
                        ...config.support_role_ids.map((roleId) => ({
                          id: roleId,
                          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
                        })),
                      ],
                  }).then(async (channel) => {

                    const pingRoles = config.pingRoles && config.ping_role_ids.length > 0;
                    const rolesToMention = pingRoles ? config.ping_role_ids.map(roleId => `<@&${roleId}>`).join(' ') : '';
  
                    await channel.send({ content: rolesToMention, embeds: [openedEmbed], components: [answerRow], fetchReply: true }).then(async (message) => {
  
                      let newTicketOpened = new EmbedBuilder()
                      .setTitle("Ticket Created!")
                      .setColor(config.default_embed_color)
                      .setDescription(`Your new ticket (<#${channel.id}>) has been created, **${interaction.user.username}!**`)
                      .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
                      .setTimestamp();
                      const actionRow4 = new ActionRowBuilder()
                          .addComponents(
                              new ButtonBuilder()
                                  .setStyle(ButtonStyle.Link)
                                  .setURL(`${channel.url}`) 
                                  .setLabel('Click Here')
                                  .setEmoji('🎫'))
                          await interaction.editReply({
                            embeds: [newTicketOpened],
                            components: [actionRow4],
                            ephemeral: true,
                            });

                            await ticketsDB.set(`${channel.id}`, {
                                userID: interaction.user.id,
                                ticketType: category.name,
                                button: customId,
                                msgID: message.id,
                                claimed: false,
                                claimUser: "",
                                status: "Open",
                                closeUserID: ""
                            });

                            await mainDB.push('openTickets', `${channel.id}`);
  
                            const logEmbed = new EmbedBuilder()
                            .setColor(config.default_embed_color)
                            .setTitle('Ticket Logs | Ticket Created')
                            .addFields([
                                { name: '• Ticket Creator', value: `> <@!${interaction.user.id}>\n> ${interaction.user.tag}` },
                                { name: '• Ticket', value: `> #${channel.name}` },
                             ])
                            .setTimestamp()
                            .setThumbnail(interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 }))
                            .setFooter({ text: `${interaction.user.tag}`, iconURL: `${interaction.user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 })}` })
                          
                            let logsChannel = interaction.guild.channels.cache.get(config.logs_channel_id);
                            await logsChannel.send({ embeds: [logEmbed]})
  
  
                      await message.pin().then(() => { setTimeout(async () => {
                      await message.channel.bulkDelete(1);
                    }, 1250); }); 
  
                  } );
  
                    await channel.send({ content: `<@${interaction.user.id}>`}).then((message) => { message.delete() } );
  
                  });
  
                  await mainDB.set('totalTickets', TICKETCOUNT + 1);
  
                } catch (error) {
                  console.error('Error creating ticket:', error);
                  return null;
                }

              }
            });

         }
    }
};