/**
 * Domain types for items.
 *
 * The DB uses a base table (`items`) plus per-type extension tables
 * (melee_item_stats, ranged_item_stats, etc.). The `Item` discriminated union
 * folds them back into a single type for the engine.
 *
 * Schema note: `items.item_id` is the SRD key string (not a UUID) — mapped here as `srdItemId`.
 * The UUID primary key on `items` maps to `id`.
 */

/** Item category — drives which stats extension table is used. */
export type ItemType = 'melee' | 'ranged' | 'armor' | 'focus' | 'consumable' | 'magic'

/** Who currently holds/owns this item. */
export type OwnerType = 'player' | 'npc' | 'merchant' | 'world'

/** Where the item physically is. */
export type LocationType = 'equipped' | 'backpack' | 'container' | 'ground'

/** Armor weight class. */
export type ArmorType = 'light' | 'medium' | 'heavy' | 'shield'

/** What kind of spell focus this is. */
export type FocusType = 'arcane' | 'druidic' | 'holy_symbol'

/** When a magic item's charges reset. */
export type RechargeType = 'dawn' | 'dusk' | 'never' | 'roll'

/** Magic item power tier. */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact'

/** Fields common to all items — maps to `items.items` base table. */
interface BaseItem {
  id: string
  campaignId: string
  /** SRD item key or homebrew identifier — maps to DB column `item_id`. */
  srdItemId: string
  description: string | null
  /** Value in copper pieces. */
  baseValue: number | null
  unit: string | null
  ownerType: OwnerType
  ownerId: string | null
  locationType: LocationType
  /** Container UUID if locationType = 'container'. */
  locationId: string | null
  quantity: number
}

/** Stats for melee weapons — from `items.melee_item_stats`. */
export interface MeleeItemStats {
  damageDie: string
  damageType: string
  /** JSONB array of property names, e.g. ["finesse", "versatile"]. */
  properties: unknown
}

/** Stats for ranged weapons — from `items.ranged_item_stats`. */
export interface RangedItemStats {
  damageDie: string
  damageType: string
  rangeNormal: number
  rangeLong: number
  ammoType: string | null
}

/** Stats for armor and shields — from `items.armor_stats`. */
export interface ArmorStats {
  ac: number
  armorType: ArmorType
  stealthDisadvantage: boolean
  strRequirement: number | null
}

/** Stats for spell focus items — from `items.spell_focus_stats`. */
export interface SpellFocusStats {
  focusType: FocusType
}

/** Stats for consumables (potions, scrolls, etc.) — from `items.consumable_stats`. */
export interface ConsumableStats {
  /** JSONB — effect shape varies by item. */
  effect: unknown
  chargesMax: number
  chargesCurrent: number | null
  recharge: RechargeType
}

/** Stats for magic items — from `items.magic_item_stats`. */
export interface MagicItemStats {
  customName: string | null
  rarity: ItemRarity
  attunement: boolean
  attuned: boolean
  /** Enhancement bonus: +1, +2, +3. Null if no bonus. */
  bonus: number | null
  chargesMax: number | null
  chargesCurrent: number | null
  recharge: RechargeType | null
  /** JSONB — item-specific properties. */
  properties: unknown
}

/** Discriminated union of all item types. The `itemType` field narrows to the correct `stats` shape. */
export type Item =
  | (BaseItem & { itemType: 'melee'; stats: MeleeItemStats })
  | (BaseItem & { itemType: 'ranged'; stats: RangedItemStats })
  | (BaseItem & { itemType: 'armor'; stats: ArmorStats })
  | (BaseItem & { itemType: 'focus'; stats: SpellFocusStats })
  | (BaseItem & { itemType: 'consumable'; stats: ConsumableStats })
  | (BaseItem & { itemType: 'magic'; stats: MagicItemStats })

/** Maps to `items.containers`. A location that items can be stored in. */
export interface Container {
  id: string
  campaignId: string
  name: string
  /** JSONB — either a 3D position or a zone id. */
  location: unknown
  ownerType: 'player' | 'npc' | 'world'
  /** Null if owned by the world. */
  ownerId: string | null
}
