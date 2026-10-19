//! Headless-проверка движка Drama 3 (speech_engine.rs) с настоящим speech.dll и моделью.
//!
//! Русский текст читается из файлов (UTF-8), а не из командной строки: консоль Windows
//! теряет заглавные русские буквы при вставке.
//!
//! cargo run --release --example drama_smoke -- <text.txt> <transcript.txt> <reference.wav> <luto.voice.gguf> <out_dir>
//!
//! Проверяет: загрузку dll и модели, сведения о модели и устройствах, синтез голосом none
//! с потоковой выдачей, добавление готового голоса, создание голоса из записи с текстом,
//! отмену идущего синтеза.

use higgs_audio_studio_lib::audio::encode_pcm16_wav;
use higgs_audio_studio_lib::speech_engine::{self, SpeechEngine, SpeechError, VoiceMakeRequest, VoiceReference};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 5 {
        eprintln!("usage: drama_smoke <text.txt> <transcript.txt> <reference.wav> <voice.gguf> <out_dir>");
        std::process::exit(2);
    }
    let text = std::fs::read_to_string(&args[0]).expect("text file").trim().to_string();
    let transcript = std::fs::read_to_string(&args[1]).expect("transcript file").trim().to_string();
    let reference = &args[2];
    let voice_file = &args[3];
    let out_dir = PathBuf::from(&args[4]);
    std::fs::create_dir_all(&out_dir).unwrap();

    speech_engine::set_log_sink(Some(Arc::new(|level: &str, line: &str| {
        if level != "debug" {
            println!("  [log {level}] {line}");
        }
    })));

    let exe_dir = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let lib_path = speech_engine::default_library_path(&exe_dir).expect("speech.dll не найдена");
    let engine = Arc::new(SpeechEngine::load(&lib_path).expect("load speech.dll"));
    println!("speech.cpp {} (C API {}) из {}", engine.version(), engine.api_version(), lib_path.display());
    for d in engine.devices() {
        println!("  устройство {} {} {}: {:.1} ГБ, свободно {:.1} ГБ", d.name, d.kind, d.description,
            d.total_bytes as f64 / 1e9, d.free_bytes as f64 / 1e9);
    }

    let model_path = speech_engine::default_model_path().expect("модель не найдена");
    println!("модель: {}", model_path.display());
    let file_info = engine.model_info_from_file(&model_path.to_string_lossy()).expect("model info");
    println!("опции из файла: {}", serde_json::to_string(&file_info.options).unwrap());

    let t = Instant::now();
    let info = engine
        .load_model(&model_path.to_string_lossy(), None, None, false)
        .expect("load model");
    println!(
        "загружена за {:.1} с: устройство {:?}, потоков CPU {}, эксперты на CPU: {}, {} Гц, голоса {:?}",
        t.elapsed().as_secs_f64(), info.device, info.threads, info.experts_on_cpu, info.sample_rate,
        info.voices.iter().map(|v| v.name.clone()).collect::<Vec<_>>()
    );
    for d in engine.devices() {
        println!("  после загрузки {}: свободно {:.1} ГБ", d.name, d.free_bytes as f64 / 1e9);
    }

    // 1. Голос none, seed задан, top_k по умолчанию (4097), поток кусками.
    let synth = |name: &str, voice: &str, options: serde_json::Value| {
        let options = options.as_object().cloned().unwrap_or_default();
        let t = Instant::now();
        let first = Arc::new(AtomicU64::new(0));
        let chunks = Arc::new(AtomicU64::new(0));
        let (f, c) = (first.clone(), chunks.clone());
        let on_audio: speech_engine::AudioCallback = Arc::new(move |_chunk: &[f32]| {
            if c.fetch_add(1, Ordering::SeqCst) == 0 {
                f.store(t.elapsed().as_millis() as u64, Ordering::SeqCst);
            }
        });
        let result = engine.synthesize(&text, voice, &options, Some(on_audio));
        match result {
            Ok(r) => {
                let secs = r.samples.len() as f64 / r.sample_rate as f64;
                let path = out_dir.join(format!("{name}.wav"));
                std::fs::write(&path, encode_pcm16_wav(&r.samples, r.sample_rate, 1)).unwrap();
                println!(
                    "{name}: {:.1} с звука за {:.1} с, первый кусок через {} мс, кусков {}, seed {}, stop {} → {}",
                    secs, t.elapsed().as_secs_f64(), first.load(Ordering::SeqCst),
                    chunks.load(Ordering::SeqCst), r.seed, r.stop, path.display()
                );
            }
            Err(e) => println!("{name}: ОШИБКА {e}"),
        }
    };
    synth("1_none_seed42", "none", serde_json::json!({ "seed": 42 }));

    // 2. Плохая опция: ошибка библиотеки с именем опции, без падения.
    synth("2_bad_top_k", "none", serde_json::json!({ "top_k": 5000 }));
    synth("2_unknown_voice", "nobody", serde_json::json!({}));

    // 3. Готовый голос пользователя.
    match engine.voice_add("luto", voice_file) {
        Ok(info) => println!("голос luto добавлен; голоса: {:?}", info.voices.iter().map(|v| v.name.clone()).collect::<Vec<_>>()),
        Err(e) => println!("voice_add: ОШИБКА {e}"),
    }
    synth("3_luto_random_seed", "luto", serde_json::json!({ "seed": null, "temperature": "1", "top_p": 0.9 }));

    // 4. Голос из записи и её текста (на CPU), затем добавление.
    let made_path = out_dir.join("made.voice.gguf");
    let t = Instant::now();
    let made = engine.voice_make(&VoiceMakeRequest {
        references: vec![VoiceReference { path: reference.clone(), transcript: transcript.clone(), speaker: None }],
        voices: vec![],
        out_path: made_path.to_string_lossy().into_owned(),
        model_path: None,
        device: None,
    });
    match made {
        Ok(path) => {
            println!("голос сделан за {:.1} с: {path} ({} байт)", t.elapsed().as_secs_f64(),
                std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0));
            match engine.voice_add("made", &path) {
                Ok(_) => synth("4_made_voice", "made", serde_json::json!({ "seed": 7 })),
                Err(e) => println!("voice_add made: ОШИБКА {e}"),
            }
        }
        Err(e) => println!("voice_make: ОШИБКА {e}"),
    }
    // Запись без текста должна дать понятную ошибку.
    let no_text = engine.voice_make(&VoiceMakeRequest {
        references: vec![VoiceReference { path: reference.clone(), transcript: " ".into(), speaker: None }],
        voices: vec![],
        out_path: out_dir.join("bad.voice.gguf").to_string_lossy().into_owned(),
        model_path: None,
        device: None,
    });
    println!("голос без текста: {:?}", no_text.err().map(|e| e.to_string()));

    // 5. Отмена из другого потока через 3 с.
    let cancel_engine = engine.clone();
    let canceller = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        cancel_engine.cancel();
    });
    let long_text = format!("{text} {text} {text} {text}");
    let t = Instant::now();
    let r = engine.synthesize(&long_text, "luto", &serde_json::Map::new(), None);
    canceller.join().unwrap();
    match r {
        Err(SpeechError::Cancelled) => println!("отмена: остановлено через {:.1} с", t.elapsed().as_secs_f64()),
        Err(e) => println!("отмена: другая ошибка {e}"),
        Ok(r) => println!("отмена: НЕ сработала, синтез закончился ({} сэмплов)", r.samples.len()),
    }
    println!("идёт синтез после отмены: {}", engine.is_generating());

    engine.unload_model();
    println!("модель выгружена: {}", !engine.is_model_loaded());
}
