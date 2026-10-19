//! Headless-проверка сцены Drama 3: общий файл голосов из нескольких голосов
//! (speech_voice_params_add_voice + set_speaker) и текст с тегами <|speaker:N|>.
//! Говорящий 0 — без файла голоса (голос задаёт описание в квадратных скобках).
//!
//! cargo run --release --example drama_scene_smoke -- <scene.txt> <voice1.gguf> <voice2.gguf> <out_dir>

use higgs_audio_studio_lib::audio::encode_pcm16_wav;
use higgs_audio_studio_lib::speech_engine::{self, SpeechEngine, VoiceFileRef, VoiceMakeRequest};
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let scene = std::fs::read_to_string(&args[0]).expect("scene file").trim().to_string();
    let out_dir = PathBuf::from(&args[3]);
    std::fs::create_dir_all(&out_dir).unwrap();

    let exe_dir = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let engine = SpeechEngine::load(&speech_engine::default_library_path(&exe_dir).unwrap()).unwrap();
    let model = speech_engine::default_model_path().unwrap();
    engine.load_model(&model.to_string_lossy(), None, None, false).unwrap();

    let combined = out_dir.join("scene.voice.gguf");
    let t = Instant::now();
    let made = engine.voice_make(&VoiceMakeRequest {
        references: vec![],
        voices: vec![
            VoiceFileRef { path: args[1].clone(), speaker: Some(1) },
            VoiceFileRef { path: args[2].clone(), speaker: Some(2) },
        ],
        out_path: combined.to_string_lossy().into_owned(),
        model_path: None,
        device: None,
    });
    println!("общий голос: {:?} за {:.1} с", made.as_ref().map_err(|e| e.to_string()), t.elapsed().as_secs_f64());
    let info = engine.voice_add("scene", &combined.to_string_lossy()).unwrap();
    for v in &info.voices {
        println!("  голос {}: {}", v.name, v.description);
    }

    let t = Instant::now();
    match engine.synthesize(&scene, "scene", &serde_json::Map::new(), None) {
        Ok(r) => {
            let path = out_dir.join("scene.wav");
            std::fs::write(&path, encode_pcm16_wav(&r.samples, r.sample_rate, 1)).unwrap();
            println!("сцена: {:.1} с звука за {:.1} с, stop {}, seed {} → {}",
                r.samples.len() as f64 / r.sample_rate as f64, t.elapsed().as_secs_f64(), r.stop, r.seed, path.display());
        }
        Err(e) => println!("сцена: ОШИБКА {e}"),
    }
    engine.unload_model();
}
