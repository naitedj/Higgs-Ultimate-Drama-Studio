//! Переделка голоса вокодером WORLD (world-rs, BSD-3): высота тона и форманты по
//! отдельности. Форманты — «размер голосового тракта»: выше — голос звучит моложе и
//! меньше, ниже — старше и крупнее, при той же высоте тона.
//!
//! Цикл WORLD: DIO + StoneMask (основной тон) → CheapTrick (спектральная огибающая) →
//! D4C (апериодичность) → изменение → Synthesis.

use world_rs::cheaptrick::{cheaptrick, initialize_cheaptrick_option};
use world_rs::d4c::{d4c, initialize_d4c_option};
use world_rs::dio::{dio, initialize_dio_option};
use world_rs::stonemask::stone_mask;
use world_rs::synthesis::{get_y_length, synthesis};

/// Сдвигает высоту тона на `semitones` полутонов и форманты в `formant_ratio` раз
/// (1 — без изменений, 1.1 — форманты на 10 % выше). Звук моно, частота `sample_rate`.
pub fn morph_voice(samples: &[f32], sample_rate: u32, semitones: f64, formant_ratio: f64) -> Result<Vec<f32>, String> {
    if samples.is_empty() {
        return Err("пустая запись".into());
    }
    let fs = sample_rate as f64;
    let x: Vec<f64> = samples.iter().map(|&v| v as f64).collect();

    let mut dio_option = initialize_dio_option();
    dio_option.frame_period = 5.0;
    // Голоса от низкого мужского до высокого детского.
    dio_option.f0_floor = 60.0;
    dio_option.f0_ceil = 700.0;
    let pitch = dio(&x, fs, &dio_option).map_err(|e| format!("DIO: {e:?}"))?;
    let f0 = stone_mask(&x, x.len(), fs, &pitch.temporal_positions, &pitch.f0, pitch.f0.len())
        .map_err(|e| format!("StoneMask: {e:?}"))?;

    let ct_option = initialize_cheaptrick_option(fs);
    let fft_size = ct_option.fft_size;
    let spectrogram = cheaptrick(&x, fs, &pitch.temporal_positions, &f0, &ct_option)
        .map_err(|e| format!("CheapTrick: {e:?}"))?;
    let aperiodicity = d4c(&x, fs, &pitch.temporal_positions, &f0, fft_size, &initialize_d4c_option())
        .map_err(|e| format!("D4C: {e:?}"))?;

    let pitch_ratio = 2f64.powf(semitones / 12.0);
    let new_f0: Vec<f64> = f0.iter().map(|&v| if v > 0.0 { v * pitch_ratio } else { 0.0 }).collect();
    let ratio = formant_ratio.clamp(0.7, 1.4);
    let new_sp = warp_frequency(&spectrogram, ratio);
    let new_ap = warp_frequency(&aperiodicity, ratio);

    let y_length = get_y_length(new_f0.len(), dio_option.frame_period, fs);
    let y = synthesis(
        &new_f0,
        new_f0.len(),
        &new_sp,
        &new_ap,
        fft_size as usize,
        dio_option.frame_period,
        fs,
        y_length,
    )
    .map_err(|e| format!("Synthesis: {e:?}"))?;

    // Громкость как у исходной записи (синтез может её немного изменить).
    let peak_in = samples.iter().fold(0f32, |m, v| m.max(v.abs()));
    let peak_out = y.iter().fold(0f64, |m, v| m.max(v.abs())) as f32;
    let gain = if peak_out > 1e-6 { (peak_in / peak_out).min(4.0) } else { 1.0 };
    Ok(y.iter().map(|&v| (v as f32 * gain).clamp(-1.0, 1.0)).collect())
}

/// Сдвиг по оси частот: значение на частоте f берётся с частоты f / ratio
/// (ratio > 1 — форманты выше). Между соседними точками — линейная интерполяция.
fn warp_frequency(frames: &[Vec<f64>], ratio: f64) -> Vec<Vec<f64>> {
    if (ratio - 1.0).abs() < 1e-6 {
        return frames.to_vec();
    }
    frames
        .iter()
        .map(|bins| {
            let last = bins.len().saturating_sub(1);
            (0..bins.len())
                .map(|k| {
                    let pos = (k as f64 / ratio).min(last as f64);
                    let i = pos.floor() as usize;
                    let j = (i + 1).min(last);
                    let frac = pos - i as f64;
                    bins[i] * (1.0 - frac) + bins[j] * frac
                })
                .collect()
        })
        .collect()
}
