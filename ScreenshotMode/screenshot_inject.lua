-- Screenshot Mode: When starting a run, skip to a blind with only the score UI centered on screen
-- Press F5 to cycle randomly, F6 to start batch capture of missing permutations

-- Lookup tables
local SS_SCALING_CONFIGS = {
    { name = "White",  scaling = 1 },
    { name = "Green",  scaling = 2 },
    { name = "Purple", scaling = 3 },
}

local SS_DECK_CONFIGS = {
    { name = "Normal",  ante_scaling = 1 },
    { name = "Plasma",  ante_scaling = 2 },
}

local SS_BOSS_BLINDS = {}       -- regular bosses (not showdown, not needle/wall)
local SS_SHOWDOWN_BLINDS = {}   -- final showdown blinds
local SS_BOSS_BLINDS_INIT = false
local SS_READY = false

-- Batch capture state
local SS_BATCH = nil

local function ss_init_boss_list()
    if SS_BOSS_BLINDS_INIT then return end
    SS_BOSS_BLINDS_INIT = true
    for k, v in pairs(G.P_BLINDS) do
        if v.boss then
            if v.boss.showdown then
                table.insert(SS_SHOWDOWN_BLINDS, { key = k, def = v })
            elseif k ~= "bl_needle" and k ~= "bl_wall" then
                table.insert(SS_BOSS_BLINDS, { key = k, def = v, min_ante = v.boss.min or 1 })
            end
        end
    end
    table.sort(SS_BOSS_BLINDS, function(a, b) return a.key < b.key end)
    table.sort(SS_SHOWDOWN_BLINDS, function(a, b) return a.key < b.key end)
end

-- Ante > 8 formula from the game
local function ss_get_blind_amount(ante, scaling)
    local amounts_by_scaling = {
        [1] = { 300,  800,  2000,  5000,  11000,  20000,  35000,  50000 },
        [2] = { 300,  900,  2600,  8000,  20000,  36000,  60000, 100000 },
        [3] = { 300, 1000,  3200,  9000,  25000,  60000, 110000, 200000 },
    }
    local amounts = amounts_by_scaling[scaling] or amounts_by_scaling[1]
    if ante < 1 then return 100 end
    if ante <= 8 then return amounts[ante] end
    -- Ante > 8: use the game's formula
    local k = 0.75
    local a = amounts[8]
    local b = 1.6
    local c = ante - 8
    local d = 1 + 0.2 * (ante - 8)
    local amount = math.floor(a * (b + (k * c)^d)^c)
    amount = amount - amount % (10^math.floor(math.log10(amount) - 1))
    return amount
end

local function ss_sanitize(s)
    return s:gsub("[^%w%-_]", "_"):gsub("_+", "_"):gsub("^_", ""):gsub("_$", "")
end

-- Set a specific blind configuration and update UI
local function ss_set_blind(ante, stake_cfg, deck_cfg, blind_name, blind_mult, boss_blind_def)
    local base = ss_get_blind_amount(ante, stake_cfg.scaling)
    local chips = base * blind_mult * deck_cfg.ante_scaling

    G.GAME.blind.chips = chips
    G.GAME.blind.chip_text = number_format(chips)

    -- Update background and UI colours
    if blind_name == "Small Blind" or blind_name == "Big Blind" then
        ease_background_colour{new_colour = G.C.BLIND['Small'], contrast = 1}
        local col = mix_colours(G.C.BLUE, G.C.BLACK, 0.6)
        ease_colour(G.C.DYN_UI.MAIN, darken(G.C.BLACK, 0.05))
        ease_colour(G.C.DYN_UI.DARK, lighten(G.C.BLACK, 0.07))
        ease_colour(G.C.DYN_UI.BOSS_MAIN, darken(G.C.BLACK, 0.05))
        ease_colour(G.C.DYN_UI.BOSS_DARK, lighten(G.C.BLACK, 0.07))
    else
        -- Find this blind in P_BLINDS for its colours
        local boss_col = G.C.BLACK
        for k, v in pairs(G.P_BLINDS) do
            if v.name == blind_name then
                boss_col = v.boss_colour or G.C.BLACK
                break
            end
        end

        ease_background_colour{new_colour = lighten(mix_colours(boss_col, G.C.BLACK, 0.3), 0.1), special_colour = boss_col, contrast = 2}

        -- Set DYN_UI colours to match the boss
        local dark_col = mix_colours(boss_col, G.C.BLACK, 0.4)
        ease_colour(G.C.DYN_UI.MAIN, boss_col)
        ease_colour(G.C.DYN_UI.DARK, dark_col)
        ease_colour(G.C.DYN_UI.BOSS_MAIN, boss_col)
        ease_colour(G.C.DYN_UI.BOSS_DARK, mix_colours(boss_col, G.C.BLACK, 0.2))
    end

    -- Rebuild the UI
    if G.screenshot_ui then
        G.screenshot_ui:remove()
    end

    local _scale = 0.6
    local stake_sprite = Sprite(0, 0, _scale, _scale, G.ASSET_ATLAS["chips"], {x = 4, y = 1})
    stake_sprite.states.drag.can = false
    local chip_scale = scale_number(chips, 0.7, 100000)

    G.screenshot_ui = UIBox{
        definition = {
            n = G.UIT.ROOT,
            config = {
                align = "cm",
                r = 0.1,
                padding = 0.08,
                emboss = 0.05,
                minw = 3.2,
                colour = G.C.BLACK
            },
            nodes = {
                {
                    n = G.UIT.R,
                    config = { align = "cm", maxw = 3.1 },
                    nodes = {
                        {
                            n = G.UIT.T,
                            config = {
                                text = localize('ph_blind_score_at_least'),
                                scale = 0.35,
                                colour = G.C.WHITE,
                                shadow = true
                            }
                        }
                    }
                },
                {
                    n = G.UIT.R,
                    config = { align = "cm", minh = 0.6 },
                    nodes = {
                        {
                            n = G.UIT.C,
                            config = { align = "cm" },
                            nodes = {
                                {
                                    n = G.UIT.O,
                                    config = {
                                        w = 0.5,
                                        h = 0.5,
                                        colour = G.C.BLUE,
                                        object = stake_sprite,
                                        hover = true,
                                        can_collide = false
                                    }
                                },
                            }
                        },
                        { n = G.UIT.B, config = { h = 0.1, w = 0.1 } },
                        {
                            n = G.UIT.C,
                            config = { align = "cm" },
                            nodes = {
                                {
                                    n = G.UIT.T,
                                    config = {
                                        ref_table = G.GAME.blind,
                                        ref_value = 'chip_text',
                                        scale = chip_scale,
                                        colour = G.C.RED,
                                        shadow = true,
                                        id = 'ss_blind_count'
                                    }
                                }
                            }
                        },
                    }
                },
            }
        },
        config = {
            align = "cm",
            offset = { x = 0, y = 0 },
            major = G.ROOM_ATTACH
        }
    }

    print("[ScreenshotMode] Ante: " .. ante
        .. " | Stake: " .. stake_cfg.name
        .. " | Deck: " .. deck_cfg.name
        .. " | Blind: " .. blind_name .. " (x" .. blind_mult .. ")"
        .. " | Chips: " .. number_format(chips))

    return chips
end

-- Random cycle (F5)
local function ss_cycle_blind()
    ss_init_boss_list()

    local ante = math.random(1, 12)

    -- Build blind choices based on ante
    local blind_choices = {
        { mult = 1,   bg_name = "Small Blind" },
        { mult = 1.5, bg_name = "Big Blind" },
    }

    if ante == 8 then
        -- Ante 8: showdown blinds only
        for _, b in ipairs(SS_SHOWDOWN_BLINDS) do
            table.insert(blind_choices, { mult = b.def.mult or 2, bg_name = b.def.name, boss_def = b.def })
        end
    else
        -- Ante 1-7, 9+: regular bosses + needle/wall
        if ante >= 2 then
            table.insert(blind_choices, { mult = 1, bg_name = "The Needle", boss_def = G.P_BLINDS.bl_needle })
            table.insert(blind_choices, { mult = 4, bg_name = "The Wall",   boss_def = G.P_BLINDS.bl_wall })
        end
        for _, b in ipairs(SS_BOSS_BLINDS) do
            if ante >= b.min_ante then
                table.insert(blind_choices, { mult = b.def.mult or 2, bg_name = b.def.name, boss_def = b.def })
            end
        end
    end

    local blind_cfg = blind_choices[math.random(1, #blind_choices)]
    local stake_cfg = SS_SCALING_CONFIGS[math.random(1, #SS_SCALING_CONFIGS)]
    local deck_cfg = math.random(1, 15) == 1 and SS_DECK_CONFIGS[2] or SS_DECK_CONFIGS[1]

    ss_set_blind(ante, stake_cfg, deck_cfg, blind_cfg.bg_name, blind_cfg.mult, blind_cfg.boss_def)
end

-- Build permutation list for ONLY what's missing
local function ss_build_missing_permutations()
    ss_init_boss_list()
    local perms = {}

    -- Check what files already exist
    local existing = {}
    local files = love.filesystem.getDirectoryItems("screenshots")
    for _, f in ipairs(files) do
        existing[f] = true
    end

    for ante = 1, 12 do
        -- Determine which blinds are valid for this ante
        local blinds = {
            { name = "Small Blind", mult = 1,   boss_def = nil },
            { name = "Big Blind",   mult = 1.5, boss_def = nil },
        }

        if ante == 8 then
            -- Ante 8: showdown blinds only
            for _, b in ipairs(SS_SHOWDOWN_BLINDS) do
                table.insert(blinds, { name = b.def.name, mult = b.def.mult or 2, boss_def = b.def })
            end
        else
            -- Ante 1-7, 9+: regular bosses + needle/wall
            if ante >= 2 then
                table.insert(blinds, { name = "The Needle", mult = 1, boss_def = G.P_BLINDS.bl_needle })
                table.insert(blinds, { name = "The Wall",   mult = 4, boss_def = G.P_BLINDS.bl_wall })
            end
            for _, b in ipairs(SS_BOSS_BLINDS) do
                if ante >= b.min_ante then
                    table.insert(blinds, { name = b.def.name, mult = b.def.mult or 2, boss_def = b.def })
                end
            end
        end

        for _, stake_cfg in ipairs(SS_SCALING_CONFIGS) do
            for _, deck_cfg in ipairs(SS_DECK_CONFIGS) do
                for _, blind in ipairs(blinds) do
                    local base = ss_get_blind_amount(ante, stake_cfg.scaling)
                    local chips = base * blind.mult * deck_cfg.ante_scaling
                    local filename = string.format("ante%d_%s_%s_%s_%s.png",
                        ante,
                        ss_sanitize(stake_cfg.name),
                        ss_sanitize(deck_cfg.name),
                        ss_sanitize(blind.name),
                        number_format(chips)
                    )

                    -- Only add if screenshot doesn't already exist
                    if not existing[filename] then
                        table.insert(perms, {
                            ante = ante,
                            stake_cfg = stake_cfg,
                            deck_cfg = deck_cfg,
                            blind_name = blind.name,
                            blind_mult = blind.mult,
                            boss_def = blind.boss_def,
                            filename = filename,
                        })
                    end
                end
            end
        end
    end

    return perms
end

-- Start batch capture
local function ss_start_batch()
    local perms = ss_build_missing_permutations()
    love.filesystem.createDirectory("screenshots")

    if #perms == 0 then
        print("[ScreenshotMode] All screenshots already exist!")
        return
    end

    SS_BATCH = {
        perms = perms,
        index = 1,
        timer = 0,
        phase = "set",
        total = #perms,
    }

    print("[ScreenshotMode] Starting batch capture: " .. #perms .. " missing permutations")
end

-- Process one step of batch capture
local function ss_batch_update(dt)
    if not SS_BATCH then return end

    local batch = SS_BATCH

    if batch.phase == "set" then
        local p = batch.perms[batch.index]
        if not p then
            print("[ScreenshotMode] Batch capture complete! " .. (batch.index - 1) .. " screenshots saved.")
            SS_BATCH = nil
            return
        end

        ss_set_blind(p.ante, p.stake_cfg, p.deck_cfg, p.blind_name, p.blind_mult, p.boss_def)
        print("[ScreenshotMode] [" .. batch.index .. "/" .. batch.total .. "]")

        batch.phase = "wait"
        batch.timer = 0

    elseif batch.phase == "wait" then
        batch.timer = batch.timer + dt
        if batch.timer >= 0.9 then
            batch.phase = "capture"
        end

    elseif batch.phase == "capture" then
        local p = batch.perms[batch.index]

        love.graphics.captureScreenshot(function(image_data)
            local file_data = image_data:encode("png")
            love.filesystem.write("screenshots/" .. p.filename, file_data:getString())
        end)

        batch.index = batch.index + 1
        batch.phase = "set"
    end
end

---------------------------------------------------------------------------
-- Game hooks
---------------------------------------------------------------------------

do
    local _orig_start_run = G.FUNCS.start_run

    G.FUNCS.start_run = function(e, args)
        args = args or {}
        _orig_start_run(e, args)

        G.E_MANAGER:add_event(Event({
            trigger = 'after',
            delay = 0.6,
            no_delete = true,
            func = function()
                G.GAME.round_resets.blind_states.Small = 'Current'
                G.GAME.blind:set_blind(G.GAME.round_resets.blind, true)

                G.E_MANAGER:add_event(Event({
                    trigger = 'after',
                    delay = 0.4,
                    func = function()
                        for _, area in ipairs({G.hand, G.deck, G.jokers, G.consumeables, G.discard}) do
                            if area then
                                area.T.x = -9999
                                area.T.y = -9999
                                if area.cards then
                                    for _, card in ipairs(area.cards) do
                                        card.T.x = -9999
                                        card.T.y = -9999
                                    end
                                end
                            end
                        end

                        for i = #G.I.UIBOX, 1, -1 do
                            local box = G.I.UIBOX[i]
                            if box then box:remove() end
                        end

                        G.STATE = G.STATES.BLIND_SELECT
                        G.STATE_COMPLETE = true

                        ss_cycle_blind()
                        SS_READY = true

                        return true
                    end
                }))

                return true
            end
        }))
    end
end

-- F5 = random cycle, F6 = start batch capture of missing screenshots
do
    local _orig_key_press_update = Controller.key_press_update
    Controller.key_press_update = function(self, key, dt)
        if SS_READY and not SS_BATCH then
            if key == "f5" then
                ss_cycle_blind()
                return
            elseif key == "f6" then
                ss_start_batch()
                return
            end
        end
        return _orig_key_press_update(self, key, dt)
    end
end

-- Hook update loop for batch processing
do
    local _orig_update = Game.update
    Game.update = function(self, dt)
        _orig_update(self, dt)
        if SS_BATCH then
            ss_batch_update(dt)
        end
    end
end
