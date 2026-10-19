//! Второй движок синтеза: speech.cpp (Fish Audio Drama 3).
//!
//! `speech.dll` загружается динамически через `libloading`, как `engine.rs` грузит
//! audiocpp: `speech.lib` не линкуется, поэтому сборка проходит и без speech.cpp.
//! Сигнатуры сверены с `include/speech.h` speech.cpp 0.8.10 (C API 3.3).

use libloading::Library;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use thiserror::Error;

/// Версия C API, под которую написан модуль: major должен совпасть, minor — не меньше.
const API_MAJOR: c_int = 3;
const API_MINOR: c_int = 3;

/// top_k по умолчанию в Drama Studio. Модельный 30 даёт паузы-зависания на 10+ секунд
/// (модель застревает в «кодах тишины»); 4097 = без ограничения, top_p продолжает работать.
pub const DEFAULT_TOP_K: i64 = 4097;

/// Имя файла модели Drama 3, которую ищем по умолчанию.
pub const DEFAULT_MODEL_FILE: &str = "Drama-35B-A3B-v3-Q4_K.gguf";

const LOG_HISTORY_LINES: usize = 400;

pub type AudioCallback = Arc<dyn Fn(&[f32]) + Send + Sync + 'static>;
pub type LogCallback = Arc<dyn Fn(&str, &str) + Send + Sync + 'static>;

// ─── Ошибки ───────────────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum SpeechError {
    #[error("не удалось загрузить speech.dll: {0}")]
    LibraryLoad(String),
    #[error("модель Drama 3 не загружена")]
    NoModel,
    #[error("синтез отменён")]
    Cancelled,
    #[error("{0}")]
    InvalidParam(String),
    /// Ошибка, которую вернула сама библиотека: статус, сообщение и опция, к которой она относится.
    #[error("{}", format_status_error(.status, .message, .option))]
    Status {
        status: String,
        message: String,
        option: Option<String>,
    },
}

fn format_status_error(status: &str, message: &str, option: &Option<String>) -> String {
    match option {
        Some(option) => format!("speech.cpp ({status}, {option}): {message}"),
        None => format!("speech.cpp ({status}): {message}"),
    }
}

// ─── Данные для интерфейса ────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub index: usize,
    pub name: String,
    pub description: String,
    /// "cpu", "gpu" или "igpu".
    pub kind: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    pub name: String,
    pub language: String,
    pub gender: String,
    pub description: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionInfo {
    pub name: String,
    /// "string", "int", "float" или "bool".
    #[serde(rename = "type")]
    pub kind: String,
    pub required: bool,
    pub steers: bool,
    pub default: Option<serde_json::Value>,
    /// Границы диапазона; None — без границы (в JSON бесконечность не записать).
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub min_exclusive: bool,
    pub choices: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub name: String,
    pub organization: String,
    pub architecture: String,
    pub weight_type: String,
    /// "synthesis", "recognition" или "detection".
    pub task: String,
    pub sample_rate: i32,
    /// Модель отдаёт звук по мере готовности.
    pub incremental: bool,
    pub max_text_tokens: usize,
    pub voices: Vec<VoiceInfo>,
    pub voice_files: bool,
    pub options: Vec<OptionInfo>,
    pub file_bytes: u64,
    pub weight_bytes: u64,
    /// Устройство загруженной модели ("Vulkan0", "CPU"); None для информации из файла.
    pub device: Option<String>,
    /// Потоки CPU загруженной модели; больше 0 у модели на GPU = часть экспертов считается на CPU.
    pub threads: i32,
    pub experts_on_cpu: bool,
}

/// Голос для файла голосов Drama 3: запись с её точным текстом.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceReference {
    pub path: String,
    pub transcript: String,
    pub speaker: Option<i32>,
}

/// Готовый файл голоса, который входит в общий файл голосов.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceFileRef {
    pub path: String,
    pub speaker: Option<i32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceMakeRequest {
    #[serde(default)]
    pub references: Vec<VoiceReference>,
    #[serde(default)]
    pub voices: Vec<VoiceFileRef>,
    pub out_path: String,
    /// Модель, для которой делается голос; по умолчанию — загруженная.
    pub model_path: Option<String>,
    /// Устройство кодировщика; по умолчанию "cpu", чтобы не делить видеопамять с моделью.
    pub device: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SynthesisResult {
    pub sample_rate: i32,
    pub samples: Vec<f32>,
    pub seed: i64,
    /// "complete", "max_seconds", "model_limit" или "cancelled".
    pub stop: String,
}

// ─── FFI ──────────────────────────────────────────────────────────────────

type Status = c_int;
const SPEECH_OK: Status = 0;
const SPEECH_CANCELLED: Status = 1;

const TYPE_STRING: c_int = 0;
const TYPE_INT: c_int = 1;
const TYPE_FLOAT: c_int = 2;
const TYPE_BOOL: c_int = 3;

/// Номер опции `experts_on_cpu` в словаре speech_option (C API 3.3).
const OPT_EXPERTS_ON_CPU: c_int = 46;

type LogCallbackC = unsafe extern "C" fn(c_int, *const c_char, *mut c_void);
type AudioCallbackC = unsafe extern "C" fn(*const f32, usize, *mut c_void) -> c_int;

/// Указатели на функции speech.dll. Поля называются как функции C API без префикса `speech_`.
struct Api {
    api_version_major: unsafe extern "C" fn() -> c_int,
    api_version_minor: unsafe extern "C" fn() -> c_int,
    version: unsafe extern "C" fn() -> *const c_char,
    status_name: unsafe extern "C" fn(Status) -> *const c_char,
    last_error: unsafe extern "C" fn() -> *const c_char,
    last_error_option: unsafe extern "C" fn() -> *const c_char,
    log_set: unsafe extern "C" fn(Option<LogCallbackC>, *mut c_void),

    device_count: unsafe extern "C" fn() -> usize,
    device_name: unsafe extern "C" fn(usize) -> *const c_char,
    device_description: unsafe extern "C" fn(usize) -> *const c_char,
    device_get_kind: unsafe extern "C" fn(usize, *mut c_int) -> Status,
    device_memory: unsafe extern "C" fn(usize, *mut u64, *mut u64) -> Status,

    option_name: unsafe extern "C" fn(c_int) -> *const c_char,
    option_from_name: unsafe extern "C" fn(*const c_char, *mut c_int) -> Status,
    option_type: unsafe extern "C" fn(c_int) -> c_int,

    load_params_new: unsafe extern "C" fn(*mut *mut c_void) -> Status,
    load_params_free: unsafe extern "C" fn(*mut c_void),
    load_params_set_device: unsafe extern "C" fn(*mut c_void, *const c_char) -> Status,
    load_params_set_threads: unsafe extern "C" fn(*mut c_void, c_int) -> Status,
    load_params_set_warmup: unsafe extern "C" fn(*mut c_void, c_int) -> Status,

    model_info_open: unsafe extern "C" fn(*const c_char, *mut *mut c_void) -> Status,
    model_info_free: unsafe extern "C" fn(*mut c_void),
    model_info_name: unsafe extern "C" fn(*const c_void) -> *const c_char,
    model_info_organization: unsafe extern "C" fn(*const c_void) -> *const c_char,
    model_info_weight_type: unsafe extern "C" fn(*const c_void) -> *const c_char,
    model_info_architecture: unsafe extern "C" fn(*const c_void) -> *const c_char,
    model_info_task: unsafe extern "C" fn(*const c_void) -> c_int,
    model_info_sample_rate: unsafe extern "C" fn(*const c_void) -> c_int,
    model_info_incremental: unsafe extern "C" fn(*const c_void) -> c_int,
    model_info_voice_count: unsafe extern "C" fn(*const c_void) -> usize,
    model_info_voice_name: unsafe extern "C" fn(*const c_void, usize) -> *const c_char,
    model_info_voice_language: unsafe extern "C" fn(*const c_void, usize) -> *const c_char,
    model_info_voice_gender: unsafe extern "C" fn(*const c_void, usize) -> *const c_char,
    model_info_voice_description: unsafe extern "C" fn(*const c_void, usize) -> *const c_char,
    model_info_voice_files: unsafe extern "C" fn(*const c_void) -> c_int,
    model_info_max_text_tokens: unsafe extern "C" fn(*const c_void) -> usize,
    model_info_option_count: unsafe extern "C" fn(*const c_void) -> usize,
    model_info_option: unsafe extern "C" fn(*const c_void, usize) -> c_int,
    model_info_takes: unsafe extern "C" fn(*const c_void, c_int) -> c_int,
    model_info_option_required: unsafe extern "C" fn(*const c_void, c_int) -> c_int,
    model_info_option_steers: unsafe extern "C" fn(*const c_void, c_int) -> c_int,
    model_info_option_has_default: unsafe extern "C" fn(*const c_void, c_int) -> c_int,
    model_info_option_default_string:
        unsafe extern "C" fn(*const c_void, c_int, *mut *const c_char) -> Status,
    model_info_option_default_int: unsafe extern "C" fn(*const c_void, c_int, *mut i64) -> Status,
    model_info_option_default_float:
        unsafe extern "C" fn(*const c_void, c_int, *mut f64) -> Status,
    model_info_option_default_bool:
        unsafe extern "C" fn(*const c_void, c_int, *mut c_int) -> Status,
    model_info_option_range:
        unsafe extern "C" fn(*const c_void, c_int, *mut f64, *mut f64, *mut c_int) -> Status,
    model_info_option_choice_count: unsafe extern "C" fn(*const c_void, c_int) -> usize,
    model_info_option_choice: unsafe extern "C" fn(*const c_void, c_int, usize) -> *const c_char,
    model_info_file_bytes: unsafe extern "C" fn(*const c_void) -> u64,
    model_info_weight_bytes: unsafe extern "C" fn(*const c_void) -> u64,
    model_info_device: unsafe extern "C" fn(*const c_void) -> *const c_char,
    model_info_threads: unsafe extern "C" fn(*const c_void) -> c_int,

    model_load: unsafe extern "C" fn(*const c_char, *const c_void, *mut *mut c_void) -> Status,
    model_free: unsafe extern "C" fn(*mut c_void),
    model_get_info: unsafe extern "C" fn(*const c_void, *mut *mut c_void) -> Status,

    voice_add: unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> Status,
    voice_params_new: unsafe extern "C" fn(*mut *mut c_void) -> Status,
    voice_params_free: unsafe extern "C" fn(*mut c_void),
    voice_params_add_reference: unsafe extern "C" fn(*mut c_void, *const c_char) -> Status,
    voice_params_set_transcript: unsafe extern "C" fn(*mut c_void, *const c_char) -> Status,
    voice_params_set_speaker: unsafe extern "C" fn(*mut c_void, c_int) -> Status,
    voice_params_add_voice: unsafe extern "C" fn(*mut c_void, *const c_char) -> Status,
    voice_make_from:
        unsafe extern "C" fn(*const c_char, *const c_void, *const c_char, *const c_void) -> Status,

    request_new: unsafe extern "C" fn(*mut c_void, *mut *mut c_void) -> Status,
    request_free: unsafe extern "C" fn(*mut c_void),
    request_set_text: unsafe extern "C" fn(*mut c_void, *const c_char) -> Status,
    request_set_string: unsafe extern "C" fn(*mut c_void, c_int, *const c_char) -> Status,
    request_set_int: unsafe extern "C" fn(*mut c_void, c_int, i64) -> Status,
    request_set_float: unsafe extern "C" fn(*mut c_void, c_int, f64) -> Status,
    request_set_bool: unsafe extern "C" fn(*mut c_void, c_int, c_int) -> Status,
    request_cancel: unsafe extern "C" fn(*mut c_void),
    synthesize: unsafe extern "C" fn(*mut c_void, AudioCallbackC, *mut c_void) -> Status,
    request_result: unsafe extern "C" fn(*const c_void) -> *const c_void,
    result_stop: unsafe extern "C" fn(*const c_void) -> c_int,
    result_seed: unsafe extern "C" fn(*const c_void) -> i64,
    stop_name: unsafe extern "C" fn(c_int) -> *const c_char,
}

impl Api {
    unsafe fn load(lib: &Library) -> Result<Self, SpeechError> {
        macro_rules! sym {
            ($name:literal) => {
                *lib.get(concat!($name, "\0").as_bytes()).map_err(|e| {
                    SpeechError::LibraryLoad(format!(
                        "в speech.dll нет функции {}: {e}. Нужна speech.cpp 0.8.10 или новее.",
                        $name
                    ))
                })?
            };
        }
        Ok(Api {
            api_version_major: sym!("speech_api_version_major"),
            api_version_minor: sym!("speech_api_version_minor"),
            version: sym!("speech_version"),
            status_name: sym!("speech_status_name"),
            last_error: sym!("speech_last_error"),
            last_error_option: sym!("speech_last_error_option"),
            log_set: sym!("speech_log_set"),
            device_count: sym!("speech_device_count"),
            device_name: sym!("speech_device_name"),
            device_description: sym!("speech_device_description"),
            device_get_kind: sym!("speech_device_get_kind"),
            device_memory: sym!("speech_device_memory"),
            option_name: sym!("speech_option_name"),
            option_from_name: sym!("speech_option_from_name"),
            option_type: sym!("speech_option_type"),
            load_params_new: sym!("speech_load_params_new"),
            load_params_free: sym!("speech_load_params_free"),
            load_params_set_device: sym!("speech_load_params_set_device"),
            load_params_set_threads: sym!("speech_load_params_set_threads"),
            load_params_set_warmup: sym!("speech_load_params_set_warmup"),
            model_info_open: sym!("speech_model_info_open"),
            model_info_free: sym!("speech_model_info_free"),
            model_info_name: sym!("speech_model_info_name"),
            model_info_organization: sym!("speech_model_info_organization"),
            model_info_weight_type: sym!("speech_model_info_weight_type"),
            model_info_architecture: sym!("speech_model_info_architecture"),
            model_info_task: sym!("speech_model_info_task"),
            model_info_sample_rate: sym!("speech_model_info_sample_rate"),
            model_info_incremental: sym!("speech_model_info_incremental"),
            model_info_voice_count: sym!("speech_model_info_voice_count"),
            model_info_voice_name: sym!("speech_model_info_voice_name"),
            model_info_voice_language: sym!("speech_model_info_voice_language"),
            model_info_voice_gender: sym!("speech_model_info_voice_gender"),
            model_info_voice_description: sym!("speech_model_info_voice_description"),
            model_info_voice_files: sym!("speech_model_info_voice_files"),
            model_info_max_text_tokens: sym!("speech_model_info_max_text_tokens"),
            model_info_option_count: sym!("speech_model_info_option_count"),
            model_info_option: sym!("speech_model_info_option"),
            model_info_takes: sym!("speech_model_info_takes"),
            model_info_option_required: sym!("speech_model_info_option_required"),
            model_info_option_steers: sym!("speech_model_info_option_steers"),
            model_info_option_has_default: sym!("speech_model_info_option_has_default"),
            model_info_option_default_string: sym!("speech_model_info_option_default_string"),
            model_info_option_default_int: sym!("speech_model_info_option_default_int"),
            model_info_option_default_float: sym!("speech_model_info_option_default_float"),
            model_info_option_default_bool: sym!("speech_model_info_option_default_bool"),
            model_info_option_range: sym!("speech_model_info_option_range"),
            model_info_option_choice_count: sym!("speech_model_info_option_choice_count"),
            model_info_option_choice: sym!("speech_model_info_option_choice"),
            model_info_file_bytes: sym!("speech_model_info_file_bytes"),
            model_info_weight_bytes: sym!("speech_model_info_weight_bytes"),
            model_info_device: sym!("speech_model_info_device"),
            model_info_threads: sym!("speech_model_info_threads"),
            model_load: sym!("speech_model_load"),
            model_free: sym!("speech_model_free"),
            model_get_info: sym!("speech_model_get_info"),
            voice_add: sym!("speech_voice_add"),
            voice_params_new: sym!("speech_voice_params_new"),
            voice_params_free: sym!("speech_voice_params_free"),
            voice_params_add_reference: sym!("speech_voice_params_add_reference"),
            voice_params_set_transcript: sym!("speech_voice_params_set_transcript"),
            voice_params_set_speaker: sym!("speech_voice_params_set_speaker"),
            voice_params_add_voice: sym!("speech_voice_params_add_voice"),
            voice_make_from: sym!("speech_voice_make_from"),
            request_new: sym!("speech_request_new"),
            request_free: sym!("speech_request_free"),
            request_set_text: sym!("speech_request_set_text"),
            request_set_string: sym!("speech_request_set_string"),
            request_set_int: sym!("speech_request_set_int"),
            request_set_float: sym!("speech_request_set_float"),
            request_set_bool: sym!("speech_request_set_bool"),
            request_cancel: sym!("speech_request_cancel"),
            synthesize: sym!("speech_synthesize"),
            request_result: sym!("speech_request_result"),
            result_stop: sym!("speech_result_stop"),
            result_seed: sym!("speech_result_seed"),
            stop_name: sym!("speech_stop_name"),
        })
    }
}

/// Строка из C; NULL — пустая строка.
unsafe fn cstr(ptr: *const c_char) -> String {
    if ptr.is_null() {
        String::new()
    } else {
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }
}

fn cstring(value: &str, what: &str) -> Result<CString, SpeechError> {
    CString::new(value).map_err(|_| SpeechError::InvalidParam(format!("{what}: нулевой байт в строке")))
}

// ─── Журнал библиотеки ────────────────────────────────────────────────────
//
// speech_log_set действует на весь процесс, поэтому журнал — глобальный: последние строки
// хранятся для показа в интерфейсе, а приёмник (например, событие Tauri) задаётся снаружи.

static LOG_HISTORY: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static LOG_SINK: Mutex<Option<LogCallback>> = Mutex::new(None);
static LOG_PARTIAL: Mutex<String> = Mutex::new(String::new());

fn log_level_name(level: c_int) -> &'static str {
    match level {
        0 => "debug",
        1 => "info",
        2 => "warn",
        _ => "error",
    }
}

unsafe extern "C" fn log_trampoline(level: c_int, text: *const c_char, _user: *mut c_void) {
    if text.is_null() {
        return;
    }
    let text = CStr::from_ptr(text).to_string_lossy().into_owned();
    // ggml может прислать строку по частям: собираем до перевода строки.
    let _ = catch_unwind(AssertUnwindSafe(|| {
        let mut lines = Vec::new();
        if let Ok(mut partial) = LOG_PARTIAL.lock() {
            partial.push_str(&text);
            while let Some(pos) = partial.find('\n') {
                let line: String = partial.drain(..=pos).collect();
                let line = line.trim_end().to_string();
                if !line.is_empty() {
                    lines.push(line);
                }
            }
        }
        if lines.is_empty() {
            return;
        }
        if let Ok(mut history) = LOG_HISTORY.lock() {
            for line in &lines {
                if history.len() >= LOG_HISTORY_LINES {
                    history.pop_front();
                }
                history.push_back(line.clone());
            }
        }
        let sink = LOG_SINK.lock().ok().and_then(|guard| guard.clone());
        if let Some(sink) = sink {
            for line in &lines {
                sink(log_level_name(level), line);
            }
        }
    }));
}

/// Куда отправлять строки журнала speech.cpp (уровень, строка).
pub fn set_log_sink(sink: Option<LogCallback>) {
    if let Ok(mut guard) = LOG_SINK.lock() {
        *guard = sink;
    }
}

/// Последние строки журнала speech.cpp.
pub fn log_history() -> Vec<String> {
    LOG_HISTORY
        .lock()
        .map(|history| history.iter().cloned().collect())
        .unwrap_or_default()
}

fn clear_log_history() {
    if let Ok(mut history) = LOG_HISTORY.lock() {
        history.clear();
    }
}

// ─── Синтез: колбэк звука ─────────────────────────────────────────────────

struct SynthState {
    on_audio: Option<AudioCallback>,
    samples: Vec<f32>,
}

unsafe extern "C" fn audio_trampoline(samples: *const f32, n_samples: usize, user: *mut c_void) -> c_int {
    if user.is_null() || samples.is_null() || n_samples == 0 {
        return 0;
    }
    let state = &mut *(user as *mut SynthState);
    let chunk = std::slice::from_raw_parts(samples, n_samples);
    // Паника не должна пересечь границу C: останавливаем запрос.
    match catch_unwind(AssertUnwindSafe(|| {
        state.samples.extend_from_slice(chunk);
        if let Some(on_audio) = &state.on_audio {
            on_audio(chunk);
        }
    })) {
        Ok(()) => 0,
        Err(_) => 1,
    }
}

// ─── Движок ───────────────────────────────────────────────────────────────

struct LoadedModel {
    ptr: *mut c_void,
}

/// Путь и информация загруженной модели. Хранятся отдельно от замка модели, который
/// держится весь синтез, чтобы состояние читалось и во время синтеза.
#[derive(Clone)]
struct LoadedSummary {
    path: String,
    info: ModelInfo,
}

pub struct SpeechEngine {
    api: Api,
    library_path: PathBuf,
    model: Mutex<Option<LoadedModel>>,
    summary: Mutex<Option<LoadedSummary>>,
    /// Запрос, который сейчас синтезируется (адрес), для отмены из другого потока.
    /// Запрос освобождается только после того, как его убрали отсюда под этим же замком.
    active_request: Mutex<usize>,
    // Библиотека выгружается последней: поле объявлено в конце.
    _lib: Library,
}

unsafe impl Send for SpeechEngine {}
unsafe impl Sync for SpeechEngine {}

impl SpeechEngine {
    pub fn load(library_path: &Path) -> Result<Self, SpeechError> {
        if !library_path.is_file() {
            return Err(SpeechError::LibraryLoad(format!(
                "файл не найден: {}",
                library_path.display()
            )));
        }
        if let Some(dir) = library_path.parent() {
            crate::engine::add_dll_directory(dir);
        }
        let lib = unsafe {
            Library::new(library_path)
                .map_err(|e| SpeechError::LibraryLoad(format!("{}: {e}", library_path.display())))?
        };
        let api = unsafe { Api::load(&lib)? };

        let (major, minor) = unsafe { ((api.api_version_major)(), (api.api_version_minor)()) };
        if major != API_MAJOR || minor < API_MINOR {
            return Err(SpeechError::LibraryLoad(format!(
                "speech.dll с C API {major}.{minor}, а нужна {API_MAJOR}.{API_MINOR} или новее той же старшей версии \
                 (speech.cpp 0.8.10)"
            )));
        }

        clear_log_history();
        unsafe { (api.log_set)(Some(log_trampoline), std::ptr::null_mut()) };

        Ok(SpeechEngine {
            api,
            library_path: library_path.to_path_buf(),
            model: Mutex::new(None),
            summary: Mutex::new(None),
            active_request: Mutex::new(0),
            _lib: lib,
        })
    }

    pub fn library_path(&self) -> &Path {
        &self.library_path
    }

    pub fn version(&self) -> String {
        unsafe { cstr((self.api.version)()) }
    }

    pub fn api_version(&self) -> String {
        unsafe {
            format!(
                "{}.{}",
                (self.api.api_version_major)(),
                (self.api.api_version_minor)()
            )
        }
    }

    /// Ошибка последнего вызова на этом потоке. Вызывать сразу после неудачного вызова.
    fn status_error(&self, status: Status) -> SpeechError {
        if status == SPEECH_CANCELLED {
            return SpeechError::Cancelled;
        }
        unsafe {
            let name = cstr((self.api.status_name)(status));
            let option_ptr = (self.api.last_error_option)();
            SpeechError::Status {
                status: if name.is_empty() { format!("код {status}") } else { name },
                message: cstr((self.api.last_error)()),
                option: if option_ptr.is_null() { None } else { Some(cstr(option_ptr)) },
            }
        }
    }

    fn check(&self, status: Status) -> Result<(), SpeechError> {
        if status == SPEECH_OK {
            Ok(())
        } else {
            Err(self.status_error(status))
        }
    }

    // ─── Устройства ───────────────────────────────────────────────────────

    pub fn devices(&self) -> Vec<DeviceInfo> {
        let api = &self.api;
        let count = unsafe { (api.device_count)() };
        (0..count)
            .map(|index| unsafe {
                let mut kind: c_int = 0;
                (api.device_get_kind)(index, &mut kind);
                let (mut total, mut free) = (0u64, 0u64);
                (api.device_memory)(index, &mut total, &mut free);
                DeviceInfo {
                    index,
                    name: cstr((api.device_name)(index)),
                    description: cstr((api.device_description)(index)).trim().to_string(),
                    kind: match kind {
                        1 => "gpu",
                        2 => "igpu",
                        _ => "cpu",
                    }
                    .to_string(),
                    total_bytes: total,
                    free_bytes: free,
                }
            })
            .collect()
    }

    // ─── Информация о модели ──────────────────────────────────────────────

    /// Информация о модели из файла, без загрузки весов.
    pub fn model_info_from_file(&self, path: &str) -> Result<ModelInfo, SpeechError> {
        let path_c = cstring(path, "путь к модели")?;
        let mut info: *mut c_void = std::ptr::null_mut();
        self.check(unsafe { (self.api.model_info_open)(path_c.as_ptr(), &mut info) })?;
        let result = unsafe { self.read_model_info(info) };
        unsafe { (self.api.model_info_free)(info) };
        Ok(result)
    }

    /// Информация о загруженной модели: с устройством и добавленными голосами.
    pub fn model_info(&self) -> Option<ModelInfo> {
        self.summary.lock().unwrap().as_ref().map(|summary| summary.info.clone())
    }

    fn loaded_model_info(&self, model: *mut c_void) -> Result<ModelInfo, SpeechError> {
        let mut info: *mut c_void = std::ptr::null_mut();
        self.check(unsafe { (self.api.model_get_info)(model, &mut info) })?;
        let result = unsafe { self.read_model_info(info) };
        unsafe { (self.api.model_info_free)(info) };
        Ok(result)
    }

    unsafe fn read_model_info(&self, info: *const c_void) -> ModelInfo {
        let api = &self.api;
        let voices = (0..(api.model_info_voice_count)(info))
            .map(|i| VoiceInfo {
                name: cstr((api.model_info_voice_name)(info, i)),
                language: cstr((api.model_info_voice_language)(info, i)),
                gender: cstr((api.model_info_voice_gender)(info, i)),
                description: cstr((api.model_info_voice_description)(info, i)),
            })
            .collect();
        let options = (0..(api.model_info_option_count)(info))
            .map(|i| self.read_option_info(info, (api.model_info_option)(info, i)))
            .collect();
        let device_ptr = (api.model_info_device)(info);
        let device = if device_ptr.is_null() { None } else { Some(cstr(device_ptr)) };
        let threads = (api.model_info_threads)(info);
        let on_gpu = device
            .as_deref()
            .map(|name| !name.eq_ignore_ascii_case("cpu"))
            .unwrap_or(false);
        ModelInfo {
            name: cstr((api.model_info_name)(info)),
            organization: cstr((api.model_info_organization)(info)),
            architecture: cstr((api.model_info_architecture)(info)),
            weight_type: cstr((api.model_info_weight_type)(info)),
            task: match (api.model_info_task)(info) {
                0 => "synthesis",
                1 => "recognition",
                _ => "detection",
            }
            .to_string(),
            sample_rate: (api.model_info_sample_rate)(info),
            incremental: (api.model_info_incremental)(info) != 0,
            max_text_tokens: (api.model_info_max_text_tokens)(info),
            voices,
            voice_files: (api.model_info_voice_files)(info) != 0,
            options,
            file_bytes: (api.model_info_file_bytes)(info),
            weight_bytes: (api.model_info_weight_bytes)(info),
            device,
            threads,
            // Модель на GPU, у которой есть потоки CPU и опция experts_on_cpu, держит
            // часть экспертов в памяти CPU (см. speech_model_info_threads()).
            experts_on_cpu: on_gpu && threads > 0 && (api.model_info_takes)(info, OPT_EXPERTS_ON_CPU) != 0,
        }
    }

    unsafe fn read_option_info(&self, info: *const c_void, option: c_int) -> OptionInfo {
        let api = &self.api;
        let kind = (api.option_type)(option);
        let default = if (api.model_info_option_has_default)(info, option) != 0 {
            match kind {
                TYPE_STRING => {
                    let mut value: *const c_char = std::ptr::null();
                    ((api.model_info_option_default_string)(info, option, &mut value) == SPEECH_OK)
                        .then(|| serde_json::json!(cstr(value)))
                }
                TYPE_INT => {
                    let mut value = 0i64;
                    ((api.model_info_option_default_int)(info, option, &mut value) == SPEECH_OK)
                        .then(|| serde_json::json!(value))
                }
                TYPE_FLOAT => {
                    let mut value = 0f64;
                    ((api.model_info_option_default_float)(info, option, &mut value) == SPEECH_OK)
                        .then(|| serde_json::json!(value))
                }
                _ => {
                    let mut value: c_int = 0;
                    ((api.model_info_option_default_bool)(info, option, &mut value) == SPEECH_OK)
                        .then(|| serde_json::json!(value != 0))
                }
            }
        } else {
            None
        };
        let (mut min, mut max, mut min_exclusive) = (None, None, false);
        if kind == TYPE_INT || kind == TYPE_FLOAT {
            let (mut lo, mut hi, mut exclusive) = (0f64, 0f64, 0 as c_int);
            if (api.model_info_option_range)(info, option, &mut lo, &mut hi, &mut exclusive) == SPEECH_OK {
                min = lo.is_finite().then_some(lo);
                max = hi.is_finite().then_some(hi);
                min_exclusive = exclusive != 0;
            }
        }
        let choices = (0..(api.model_info_option_choice_count)(info, option))
            .map(|i| cstr((api.model_info_option_choice)(info, option, i)))
            .collect();
        OptionInfo {
            name: cstr((api.option_name)(option)),
            kind: match kind {
                TYPE_STRING => "string",
                TYPE_INT => "int",
                TYPE_FLOAT => "float",
                _ => "bool",
            }
            .to_string(),
            required: (api.model_info_option_required)(info, option) != 0,
            steers: (api.model_info_option_steers)(info, option) != 0,
            default,
            min,
            max,
            min_exclusive,
            choices,
        }
    }

    // ─── Загрузка модели ──────────────────────────────────────────────────

    pub fn is_model_loaded(&self) -> bool {
        self.summary.lock().unwrap().is_some()
    }

    pub fn model_path(&self) -> Option<String> {
        self.summary.lock().unwrap().as_ref().map(|summary| summary.path.clone())
    }

    /// Загружает модель. `device`: "auto", "gpu", "cpu" или имя вроде "Vulkan0";
    /// `threads`: потоки CPU (для экспертов, что не влезли в GPU), None — по умолчанию библиотеки.
    /// Уже загруженная модель сначала выгружается.
    pub fn load_model(
        &self,
        path: &str,
        device: Option<&str>,
        threads: Option<i32>,
        warmup: bool,
    ) -> Result<ModelInfo, SpeechError> {
        let path_c = cstring(path, "путь к модели")?;
        let mut guard = self.model.lock().unwrap();
        if let Some(old) = guard.take() {
            *self.summary.lock().unwrap() = None;
            unsafe { (self.api.model_free)(old.ptr) };
        }

        let api = &self.api;
        let mut params: *mut c_void = std::ptr::null_mut();
        self.check(unsafe { (api.load_params_new)(&mut params) })?;
        let configured = (|| -> Result<(), SpeechError> {
            if let Some(device) = device.map(str::trim).filter(|d| !d.is_empty()) {
                let device_c = cstring(device, "устройство")?;
                self.check(unsafe { (api.load_params_set_device)(params, device_c.as_ptr()) })?;
            }
            if let Some(threads) = threads.filter(|t| *t > 0) {
                self.check(unsafe { (api.load_params_set_threads)(params, threads) })?;
            }
            if warmup {
                self.check(unsafe { (api.load_params_set_warmup)(params, 1) })?;
            }
            Ok(())
        })();
        if let Err(e) = configured {
            unsafe { (api.load_params_free)(params) };
            return Err(e);
        }

        let mut model: *mut c_void = std::ptr::null_mut();
        let status = unsafe { (api.model_load)(path_c.as_ptr(), params, &mut model) };
        let load_error = (status != SPEECH_OK).then(|| self.status_error(status));
        unsafe { (api.load_params_free)(params) };
        if let Some(e) = load_error {
            return Err(e);
        }

        let info = match self.loaded_model_info(model) {
            Ok(info) => info,
            Err(e) => {
                unsafe { (api.model_free)(model) };
                return Err(e);
            }
        };
        if info.task != "synthesis" {
            unsafe { (api.model_free)(model) };
            return Err(SpeechError::InvalidParam(format!(
                "модель {} не синтезирует речь (задача: {})",
                info.name, info.task
            )));
        }
        *guard = Some(LoadedModel { ptr: model });
        *self.summary.lock().unwrap() = Some(LoadedSummary {
            path: path.to_string(),
            info: info.clone(),
        });
        Ok(info)
    }

    /// Выгружает модель. Если идёт синтез, отменяет его и ждёт окончания.
    pub fn unload_model(&self) {
        self.cancel();
        let mut guard = self.model.lock().unwrap();
        if let Some(model) = guard.take() {
            *self.summary.lock().unwrap() = None;
            unsafe { (self.api.model_free)(model.ptr) };
        }
    }

    // ─── Голоса ───────────────────────────────────────────────────────────

    /// Добавляет файл голоса (.voice.gguf) в загруженную модель под именем `name`.
    pub fn voice_add(&self, name: &str, path: &str) -> Result<ModelInfo, SpeechError> {
        let name_c = cstring(name, "имя голоса")?;
        let path_c = cstring(path, "путь к голосу")?;
        let guard = self.model.lock().unwrap();
        let model = guard.as_ref().ok_or(SpeechError::NoModel)?;
        self.check(unsafe { (self.api.voice_add)(model.ptr, name_c.as_ptr(), path_c.as_ptr()) })?;
        let info = self.loaded_model_info(model.ptr)?;
        if let Some(summary) = self.summary.lock().unwrap().as_mut() {
            summary.info = info.clone();
        }
        Ok(info)
    }

    /// Делает файл голоса Drama 3 из записей с их текстами и/или готовых файлов голосов.
    /// Записи должны быть WAV; текст должен совпадать с записью слово в слово.
    pub fn voice_make(&self, request: &VoiceMakeRequest) -> Result<String, SpeechError> {
        if request.references.is_empty() && request.voices.is_empty() {
            return Err(SpeechError::InvalidParam(
                "для голоса нужна хотя бы одна запись или файл голоса".into(),
            ));
        }
        let model_path = match request.model_path.as_deref().filter(|p| !p.trim().is_empty()) {
            Some(path) => path.to_string(),
            None => self.model_path().ok_or_else(|| {
                SpeechError::InvalidParam("не указан файл модели, и модель не загружена".into())
            })?,
        };
        let model_path_c = cstring(&model_path, "путь к модели")?;
        let out_path_c = cstring(&request.out_path, "путь голоса")?;
        let device = request.device.as_deref().filter(|d| !d.trim().is_empty()).unwrap_or("cpu");
        let device_c = cstring(device, "устройство")?;

        let api = &self.api;
        let mut voice: *mut c_void = std::ptr::null_mut();
        self.check(unsafe { (api.voice_params_new)(&mut voice) })?;
        let mut load: *mut c_void = std::ptr::null_mut();
        if let Err(e) = self.check(unsafe { (api.load_params_new)(&mut load) }) {
            unsafe { (api.voice_params_free)(voice) };
            return Err(e);
        }

        let made = (|| -> Result<(), SpeechError> {
            for reference in &request.references {
                let transcript = reference.transcript.trim();
                if transcript.is_empty() {
                    return Err(SpeechError::InvalidParam(format!(
                        "у записи {} нет текста: Drama 3 нужен точный текст каждой записи",
                        reference.path
                    )));
                }
                let path_c = cstring(&reference.path, "путь к записи")?;
                let text_c = cstring(transcript, "текст записи")?;
                self.check(unsafe { (api.voice_params_add_reference)(voice, path_c.as_ptr()) })?;
                self.check(unsafe { (api.voice_params_set_transcript)(voice, text_c.as_ptr()) })?;
                if let Some(speaker) = reference.speaker {
                    self.check(unsafe { (api.voice_params_set_speaker)(voice, speaker) })?;
                }
            }
            for file in &request.voices {
                let path_c = cstring(&file.path, "путь к голосу")?;
                self.check(unsafe { (api.voice_params_add_voice)(voice, path_c.as_ptr()) })?;
                if let Some(speaker) = file.speaker {
                    self.check(unsafe { (api.voice_params_set_speaker)(voice, speaker) })?;
                }
            }
            self.check(unsafe { (api.load_params_set_device)(load, device_c.as_ptr()) })?;
            self.check(unsafe {
                (api.voice_make_from)(model_path_c.as_ptr(), voice, out_path_c.as_ptr(), load)
            })
        })();

        unsafe {
            (api.load_params_free)(load);
            (api.voice_params_free)(voice);
        }
        made.map(|()| request.out_path.clone())
    }

    // ─── Синтез ───────────────────────────────────────────────────────────

    /// Устанавливает опцию запроса по имени; сеттер выбирается по типу опции.
    /// `null` и пустая строка у нестроковой опции пропускаются (например, пустой seed = случайный).
    fn set_option(&self, request: *mut c_void, name: &str, value: &serde_json::Value) -> Result<(), SpeechError> {
        if value.is_null() || (value.as_str().map(|s| s.trim().is_empty()).unwrap_or(false) && name != "voice") {
            return Ok(());
        }
        let api = &self.api;
        let name_c = cstring(name, "имя опции")?;
        let mut option: c_int = 0;
        self.check(unsafe { (api.option_from_name)(name_c.as_ptr(), &mut option) })?;
        let wrong = || SpeechError::InvalidParam(format!("опция {name}: неподходящее значение {value}"));
        let status = match unsafe { (api.option_type)(option) } {
            TYPE_STRING => {
                let text = match value {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                let text_c = cstring(&text, name)?;
                unsafe { (api.request_set_string)(request, option, text_c.as_ptr()) }
            }
            TYPE_INT => {
                let number = match value {
                    serde_json::Value::Number(n) => n
                        .as_i64()
                        .or_else(|| n.as_f64().filter(|f| f.fract() == 0.0).map(|f| f as i64)),
                    serde_json::Value::String(s) => s.trim().parse::<i64>().ok(),
                    _ => None,
                }
                .ok_or_else(wrong)?;
                unsafe { (api.request_set_int)(request, option, number) }
            }
            TYPE_FLOAT => {
                let number = match value {
                    serde_json::Value::Number(n) => n.as_f64(),
                    serde_json::Value::String(s) => s.trim().replace(',', ".").parse::<f64>().ok(),
                    _ => None,
                }
                .ok_or_else(wrong)?;
                unsafe { (api.request_set_float)(request, option, number) }
            }
            TYPE_BOOL => {
                let flag = match value {
                    serde_json::Value::Bool(b) => *b,
                    serde_json::Value::Number(n) => n.as_f64().map(|f| f != 0.0).ok_or_else(wrong)?,
                    serde_json::Value::String(s) => match s.trim() {
                        "true" | "1" => true,
                        "false" | "0" => false,
                        _ => return Err(wrong()),
                    },
                    _ => return Err(wrong()),
                };
                unsafe { (api.request_set_bool)(request, option, flag as c_int) }
            }
            _ => return Err(wrong()),
        };
        self.check(status)
    }

    /// Синтезирует `text` голосом `voice` ("none" или добавленный голос) с опциями
    /// `options` (имя опции → значение). Если top_k не задан и модель его принимает,
    /// ставится DEFAULT_TOP_K. Звук приходит в `on_audio` по мере готовности.
    pub fn synthesize(
        &self,
        text: &str,
        voice: &str,
        options: &serde_json::Map<String, serde_json::Value>,
        on_audio: Option<AudioCallback>,
    ) -> Result<SynthesisResult, SpeechError> {
        if text.trim().is_empty() {
            return Err(SpeechError::InvalidParam("пустой текст".into()));
        }
        let voice = if voice.trim().is_empty() { "none" } else { voice.trim() };
        let text_c = cstring(text, "текст")?;
        let api = &self.api;

        // Замок модели держится весь синтез: выгрузка подождёт его окончания.
        let guard = self.model.lock().unwrap();
        let model = guard.as_ref().ok_or(SpeechError::NoModel)?;
        let info = self.loaded_model_info(model.ptr)?;

        let mut request: *mut c_void = std::ptr::null_mut();
        self.check(unsafe { (api.request_new)(model.ptr, &mut request) })?;

        let prepared = (|| -> Result<(), SpeechError> {
            self.check(unsafe { (api.request_set_text)(request, text_c.as_ptr()) })?;
            self.set_option(request, "voice", &serde_json::json!(voice))?;
            let takes_top_k = info.options.iter().any(|option| option.name == "top_k");
            if takes_top_k && !options.get("top_k").map(|v| !v.is_null()).unwrap_or(false) {
                self.set_option(request, "top_k", &serde_json::json!(DEFAULT_TOP_K))?;
            }
            for (name, value) in options {
                if name == "voice" {
                    continue;
                }
                self.set_option(request, name, value)?;
            }
            Ok(())
        })();
        if let Err(e) = prepared {
            unsafe { (api.request_free)(request) };
            return Err(e);
        }

        let mut state = SynthState {
            on_audio,
            samples: Vec::new(),
        };
        *self.active_request.lock().unwrap() = request as usize;
        let status = unsafe {
            (api.synthesize)(request, audio_trampoline, &mut state as *mut SynthState as *mut c_void)
        };
        let error = (status != SPEECH_OK).then(|| self.status_error(status));
        *self.active_request.lock().unwrap() = 0;

        let outcome = match error {
            Some(e) => Err(e),
            None => unsafe {
                let result = (api.request_result)(request);
                if result.is_null() {
                    Err(SpeechError::Status {
                        status: "internal".into(),
                        message: "speech.cpp не вернула результат синтеза".into(),
                        option: None,
                    })
                } else {
                    Ok(SynthesisResult {
                        sample_rate: info.sample_rate,
                        samples: std::mem::take(&mut state.samples),
                        seed: (api.result_seed)(result),
                        stop: cstr((api.stop_name)((api.result_stop)(result))),
                    })
                }
            },
        };
        unsafe { (api.request_free)(request) };
        drop(guard);
        outcome
    }

    /// Останавливает идущий синтез; он вернётся с SpeechError::Cancelled.
    pub fn cancel(&self) {
        let active = self.active_request.lock().unwrap();
        if *active != 0 {
            unsafe { (self.api.request_cancel)(*active as *mut c_void) };
        }
    }

    pub fn is_generating(&self) -> bool {
        *self.active_request.lock().unwrap() != 0
    }
}

impl Drop for SpeechEngine {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.model.lock() {
            if let Some(model) = guard.take() {
                unsafe { (self.api.model_free)(model.ptr) };
            }
        }
        // Колбэк журнала живёт в нашем exe, но после выгрузки dll звать его некому — отключаем.
        unsafe { (self.api.log_set)(None, std::ptr::null_mut()) };
    }
}

// ─── Пути по умолчанию ────────────────────────────────────────────────────

/// Папка speech.cpp пользователя, куда была распакована сборка 0.8.10.
const USER_SPEECH_DIR: &str = r"W:\TTS\speech.cpp\speech-0.8.10-windows-x64-vulkan";

/// speech.dll по умолчанию: рядом с программой, затем в папке пользователя.
pub fn default_library_path(app_root: &Path) -> Option<PathBuf> {
    [
        app_root.join("speech.dll"),
        app_root.join("speech").join("speech.dll"),
        Path::new(USER_SPEECH_DIR).join("speech.dll"),
    ]
    .into_iter()
    .find(|path| path.is_file())
}

/// Папка моделей speech.cpp: %LOCALAPPDATA%\speech.cpp\models.
pub fn models_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|dir| PathBuf::from(dir).join("speech.cpp").join("models"))
}

/// Модель Drama 3 по умолчанию: ищет Drama-35B-A3B-v3-Q4_K.gguf в папке моделей speech.cpp
/// (модели лежат в подпапках вида sakasegawa--drama-3-GGUF\<хеш>\), иначе любой Drama*.gguf.
pub fn default_model_path() -> Option<PathBuf> {
    let root = models_dir()?;
    let mut found = Vec::new();
    collect_gguf(&root, 3, &mut found);
    found
        .iter()
        .find(|path| path.file_name().map(|n| n == DEFAULT_MODEL_FILE).unwrap_or(false))
        .or_else(|| {
            found.iter().find(|path| {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                name.starts_with("drama") && !name.ends_with(".voice.gguf")
            })
        })
        .cloned()
}

fn collect_gguf(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth > 0 {
                collect_gguf(&path, depth - 1, out);
            }
        } else if path
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
}
