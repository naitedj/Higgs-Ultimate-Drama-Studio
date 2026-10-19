//! Headless-проверка «возраста» Студии голоса: WORLD сдвигает форманты и высоту тона.
//!
//! cargo run --release --example voice_morph_smoke -- <in.wav> <out_dir>

use higgs_audio_studio_lib::voice_morph::morph_voice;
use std::time::Instant;

fn read_mono(path: &str) -> (Vec<f32>, u32) {
    let mut reader = hound::WavReader::open(path).expect("wav");
    let spec = reader.spec();
    let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;
    let ch = spec.channels as usize;
    let data: Vec<f32> = reader.samples::<i32>().map(|s| s.unwrap() as f32 / scale).collect();
    (data.chunks(ch).map(|f| f.iter().sum::<f32>() / f.len() as f32).collect(), spec.sample_rate)
}

/// Median F0 by autocorrelation over voiced 40 ms windows (a rough check).
fn median_f0(x: &[f32], sr: u32) -> f32 {
    let win = (sr as f32 * 0.04) as usize;
    let mut f0s = Vec::new();
    let mut start = 0;
    while start + win * 2 < x.len() {
        let seg = &x[start..start + win * 2];
        let energy: f32 = seg[..win].iter().map(|v| v * v).sum::<f32>() / win as f32;
        if energy > 1e-4 {
            let (lo, hi) = ((sr / 500) as usize, (sr / 70) as usize);
            let mut best = (0usize, 0f32);
            for lag in lo..hi.min(win) {
                let c: f32 = (0..win).map(|i| seg[i] * seg[i + lag]).sum();
                if c > best.1 {
                    best = (lag, c);
                }
            }
            if best.0 > 0 {
                f0s.push(sr as f32 / best.0 as f32);
            }
        }
        start += win;
    }
    f0s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    f0s.get(f0s.len() / 2).copied().unwrap_or(0.0)
}

fn write(path: &str, x: &[f32], sr: u32) {
    let spec = hound::WavSpec { channels: 1, sample_rate: sr, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(path, spec).unwrap();
    for &v in x {
        w.write_sample((v.clamp(-1.0, 1.0) * 32767.0) as i16).unwrap();
    }
    w.finalize().unwrap();
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (x, sr) = read_mono(&args[0]);
    println!("source: {:.1} s at {sr} Hz, median F0 {:.0} Hz", x.len() as f32 / sr as f32, median_f0(&x, sr));
    for (name, semis, formant) in [("younger", 0.0, 1.12), ("older", 0.0, 0.88), ("pitch_up2", 2.0, 1.0), ("child", 3.0, 1.18)] {
        let t = Instant::now();
        let y = morph_voice(&x, sr, semis, formant).expect("morph");
        let out = format!("{}/morph_{name}.wav", args[1]);
        write(&out, &y, sr);
        println!("{name}: {:.1} s in {:.1} s, median F0 {:.0} Hz, length ratio {:.3} -> {out}",
            y.len() as f32 / sr as f32, t.elapsed().as_secs_f32(), median_f0(&y, sr), y.len() as f32 / x.len() as f32);
    }
}
