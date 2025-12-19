//! Backend trait and implementations for agent communication.

pub mod backend;
pub mod daemon;

pub use backend::Backend;
pub use daemon::DaemonBackend;
