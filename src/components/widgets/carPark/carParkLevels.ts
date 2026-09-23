/**
 * The Car Park level pack — FIXED, numbered, and APPEND-ONLY.
 *
 * A level's identity is `tier:index`, and players' bests key on it, so never
 * reorder or delete — add new levels to the END of a tier's list. Generate
 * candidates with `node scripts/gen-carpark-levels.mjs`; every entry's `par`
 * (optimal move count, one slide of any length = one move) is re-derived by
 * BFS in the e2e sweep, which also checks it sits inside its tier's band.
 */

export const TIERS = ['beginner', 'intermediate', 'advanced', 'expert'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABEL: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

/** Inclusive par band per tier — what makes a tier honest. */
export const TIER_BANDS: Record<Tier, readonly [number, number]> = {
  beginner: [3, 8],
  intermediate: [10, 17],
  advanced: [19, 27],
  expert: [30, 60],
}

export interface Level {
  /** 36-char row-major board (see `carParkModel`). */
  board: string
  /** Optimal move count. */
  par: number
}

export const LEVELS: Record<Tier, readonly Level[]> = {
  beginner: [
    { board: 'BoJJooBFoHHHBFAAKoCCIIKoGEoDDoGEoooo', par: 3 },
    { board: 'oDDDooooCEEoAACFooHooFooHooFooooBBGG', par: 4 },
    { board: 'HooDEFHoCDEFAACDEBGooooBGoIooBGoIooo', par: 5 },
    { board: 'ooooDDoooGGGAAooCFoBBBCFoooooEoHHHoE', par: 5 },
    { board: 'DoBoGGDoBoCIHJAACIHJoLLoHooKKEooFFoE', par: 6 },
    { board: 'EooCooEHHCJJAAoCoGKKoIIGBoFFooBDDDoo', par: 8 },
    { board: 'oBBoHHIIDDDooAAoGooFFoGoooECCCooEooo', par: 8 },
    { board: 'oooooIoooEDIAAoEDIooooGGooFFCCHHooBB', par: 8 },
    { board: 'oooooCooHooCAAHooCoDBBEEIDooFFIGGooo', par: 8 },
    { board: 'LCCoooLoGJJKAAGoEKFMMHEoFooHBBIIIoDD', par: 8 },
  ],
  intermediate: [
    { board: 'ooooooDooBCCDAABKGHEJJKGHEooIGFFFoIo', par: 10 },
    { board: 'oDooIooDFFIHoAABoHoCCBooooGEEEooGooo', par: 10 },
    { board: 'HBJoooHBJMLEAACMLEGoCooKGIFFFKGIDDNN', par: 11 },
    { board: 'ooBKGGooBKooAABoFIHCDDFIHCoooEoCJJJE', par: 12 },
    { board: 'oooBoooooBooAAoEDGFHoEDGFHCCDGoooooo', par: 13 },
    { board: 'ooBBDDooooMMAAoGHCIIoGHCJEEEHKJFFLLK', par: 13 },
    { board: 'MMBBLLEEGGoKAAoIoKCCCIoKDooHHHDJJJFF', par: 15 },
    { board: 'oJJDDLCCEEoLAAoBHIFFFBHIMKKBHoMGGGoo', par: 17 },
    { board: 'DKEEBBDKHHooDAANooLIoNMMLICGGJFFCooJ', par: 17 },
    { board: 'LLFFooooJoIHAAJoIHoGDDCCMGoEKKMBBEoo', par: 17 },
  ],
  advanced: [
    { board: 'JJoBBKHHCCMKOoAAMKOooDIIFEEDNNFoGGLL', par: 20 },
    { board: 'KKDDooGHHIFFGAAICoMNEoCJMNEBBJLLEooo', par: 20 },
    { board: 'MoJJHHMCCCENFoAAENFooLDDBBBLoIGGKKoI', par: 21 },
    { board: 'LLDDDECoMMoECoAAJKCHHGJKooFGBBIIFNNo', par: 24 },
    { board: 'GGGCBHLLoCBHIAACooIEEKKoooDJJJFFDooo', par: 27 },
    { board: 'KGGoooKoFoBBAAFHDJIIoHDJEEECCMNNLLLM', par: 27 },
    { board: 'HHoDoooooDLLEAAoMJEGFFMJEGICCJBBIKKo', par: 27 },
    { board: 'MKBJLLMKBJoGMAAoEGCCCoEGooFoDDIIFoHH', par: 27 },
    { board: 'DKKoIIDoCEEEAACooJoGMMBJoGFFBLHHooBL', par: 27 },
    { board: 'MKKoBHMFIoBHEFIAANEoIGGNoooDCCoLLDJJ', par: 27 },
  ],
  expert: [
    { board: 'oGGGBHLLoCBHAAoCooIEECKKIoDJJJFFDooo', par: 30 },
    { board: 'FLLBHHFEEBoKAAJooKooJCCKoDDDIooGGGIo', par: 30 },
    { board: 'NECCLLNEoGGBAAooHBKKJJHBooFMIIDDFMoo', par: 30 },
    { board: 'LBBGCFLKDGCFoKDAAFooNIHHooNIJJoEEMMo', par: 31 },
    { board: 'EHHDooEGoDLLEGAAMJFFIoMJooICCJoBBKKo', par: 32 },
    { board: 'MFKKBHMFIoBHooIAANGGIDoNEooDCCEoLLJJ', par: 35 },
    { board: 'GELLKKGEMMDHGEAADHFFBIDHooBIJJoCCNNo', par: 36 },
    { board: 'KELLHHKEMMGoKAAFGBIINFGBooNCCBoJJDDo', par: 36 },
    { board: 'JJoFFKCEEDBKCAADBoGGIDoooLIooooLNNHH', par: 37 },
    { board: 'MLLoEoMKBoEGMKBAAGCCCJoGooFJDDIIFHHo', par: 51 },
  ],
}
