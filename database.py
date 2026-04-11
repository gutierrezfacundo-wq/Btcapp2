"""
database.py — Operaciones SQLite para persistir precios, análisis y operaciones.
Tablas:
  - precios: historial de precios BTC/USDT
  - analisis: respuestas de Gemini guardadas
  - operaciones: trades ejecutados (manuales y automáticos)
  - configuracion: estado del bot (modo auto, balance inicial, etc.)
"""

import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._crear_tablas()

    def _conectar(self) -> sqlite3.Connection:
        """Crea una conexión a la base de datos."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _crear_tablas(self):
        """Crea las tablas necesarias si no existen."""
        conn = self._conectar()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS precios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    precio REAL NOT NULL,
                    symbol TEXT NOT NULL DEFAULT 'BTCUSDT'
                );

                CREATE INDEX IF NOT EXISTS idx_precios_timestamp
                    ON precios(timestamp);

                CREATE TABLE IF NOT EXISTS analisis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    precio_actual REAL NOT NULL,
                    variacion_1h REAL,
                    variacion_24h REAL,
                    variacion_7d REAL,
                    respuesta_gemini TEXT,
                    recomendacion TEXT,
                    porcentaje_recomendado REAL
                );

                CREATE TABLE IF NOT EXISTS operaciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    precio REAL NOT NULL,
                    cantidad_btc REAL NOT NULL,
                    monto_usdt REAL NOT NULL,
                    modo TEXT NOT NULL DEFAULT 'manual',
                    estado TEXT NOT NULL DEFAULT 'completada',
                    orden_id TEXT,
                    notas TEXT
                );

                CREATE TABLE IF NOT EXISTS configuracion (
                    clave TEXT PRIMARY KEY,
                    valor TEXT NOT NULL,
                    actualizado TEXT NOT NULL
                );
            """)
            conn.commit()
            logger.info("Tablas de base de datos verificadas/creadas correctamente")
        except sqlite3.Error as e:
            logger.error(f"Error creando tablas: {e}")
            raise
        finally:
            conn.close()

    # --- Precios ---

    def guardar_precio(self, precio: float, symbol: str = 'BTCUSDT'):
        """Guarda un precio con timestamp actual."""
        conn = self._conectar()
        try:
            ahora = datetime.utcnow().isoformat()
            conn.execute(
                "INSERT INTO precios (timestamp, precio, symbol) VALUES (?, ?, ?)",
                (ahora, precio, symbol)
            )
            conn.commit()
            logger.debug(f"Precio guardado: {precio} USDT")
        except sqlite3.Error as e:
            logger.error(f"Error guardando precio: {e}")
        finally:
            conn.close()

    def obtener_precio_hace(self, horas: float) -> Optional[float]:
        """Obtiene el precio más cercano a X horas atrás."""
        conn = self._conectar()
        try:
            desde = (datetime.utcnow() - timedelta(hours=horas)).isoformat()
            row = conn.execute(
                """SELECT precio FROM precios
                   WHERE timestamp <= ?
                   ORDER BY timestamp DESC LIMIT 1""",
                (desde,)
            ).fetchone()
            return row['precio'] if row else None
        except sqlite3.Error as e:
            logger.error(f"Error obteniendo precio histórico: {e}")
            return None
        finally:
            conn.close()

    def obtener_ultimo_precio(self) -> Optional[float]:
        """Obtiene el último precio registrado."""
        conn = self._conectar()
        try:
            row = conn.execute(
                "SELECT precio FROM precios ORDER BY timestamp DESC LIMIT 1"
            ).fetchone()
            return row['precio'] if row else None
        except sqlite3.Error as e:
            logger.error(f"Error obteniendo último precio: {e}")
            return None
        finally:
            conn.close()

    def obtener_historial_precios(self, horas: float = 168) -> list:
        """Obtiene historial de precios de las últimas X horas (default 7 días = 168h)."""
        conn = self._conectar()
        try:
            desde = (datetime.utcnow() - timedelta(hours=horas)).isoformat()
            rows = conn.execute(
                """SELECT timestamp, precio FROM precios
                   WHERE timestamp >= ?
                   ORDER BY timestamp ASC""",
                (desde,)
            ).fetchall()
            return [{'timestamp': r['timestamp'], 'precio': r['precio']} for r in rows]
        except sqlite3.Error as e:
            logger.error(f"Error obteniendo historial: {e}")
            return []
        finally:
            conn.close()

    # --- Análisis ---

    def guardar_analisis(self, precio_actual: float, variacion_1h: float,
                         variacion_24h: float, variacion_7d: float,
                         respuesta_gemini: str, recomendacion: str,
                         porcentaje_recomendado: float):
        """Guarda un análisis de Gemini."""
        conn = self._conectar()
        try:
            ahora = datetime.utcnow().isoformat()
            conn.execute(
                """INSERT INTO analisis
                   (timestamp, precio_actual, variacion_1h, variacion_24h,
                    variacion_7d, respuesta_gemini, recomendacion, porcentaje_recomendado)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (ahora, precio_actual, variacion_1h, variacion_24h,
                 variacion_7d, respuesta_gemini, recomendacion, porcentaje_recomendado)
            )
            conn.commit()
            logger.info("Análisis de Gemini guardado")
        except sqlite3.Error as e:
            logger.error(f"Error guardando análisis: {e}")
        finally:
            conn.close()

    def obtener_ultimo_analisis(self) -> Optional[dict]:
        """Obtiene el último análisis registrado."""
        conn = self._conectar()
        try:
            row = conn.execute(
                "SELECT * FROM analisis ORDER BY timestamp DESC LIMIT 1"
            ).fetchone()
            return dict(row) if row else None
        except sqlite3.Error as e:
            logger.error(f"Error obteniendo análisis: {e}")
            return None
        finally:
            conn.close()

    # --- Operaciones ---

    def guardar_operacion(self, tipo: str, precio: float, cantidad_btc: float,
                          monto_usdt: float, modo: str = 'manual',
                          orden_id: str = '', notas: str = ''):
        """Guarda una operación de trading."""
        conn = self._conectar()
        try:
            ahora = datetime.utcnow().isoformat()
            conn.execute(
                """INSERT INTO operaciones
                   (timestamp, tipo, precio, cantidad_btc, monto_usdt, modo, orden_id, notas)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (ahora, tipo, precio, cantidad_btc, monto_usdt, modo, orden_id, notas)
            )
            conn.commit()
            logger.info(f"Operación guardada: {tipo} {cantidad_btc} BTC a {precio}")
        except sqlite3.Error as e:
            logger.error(f"Error guardando operación: {e}")
        finally:
            conn.close()

    def obtener_operaciones_semana(self) -> list:
        """Obtiene las operaciones de los últimos 7 días."""
        conn = self._conectar()
        try:
            desde = (datetime.utcnow() - timedelta(days=7)).isoformat()
            rows = conn.execute(
                """SELECT * FROM operaciones
                   WHERE timestamp >= ?
                   ORDER BY timestamp DESC""",
                (desde,)
            ).fetchall()
            return [dict(r) for r in rows]
        except sqlite3.Error as e:
            logger.error(f"Error obteniendo operaciones semanales: {e}")
            return []
        finally:
            conn.close()

    def monto_operado_semana(self) -> float:
        """Calcula el monto total operado en los últimos 7 días."""
        conn = self._conectar()
        try:
            desde = (datetime.utcnow() - timedelta(days=7)).isoformat()
            row = conn.execute(
                """SELECT COALESCE(SUM(monto_usdt), 0) as total
                   FROM operaciones
                   WHERE timestamp >= ? AND estado = 'completada'""",
                (desde,)
            ).fetchone()
            return row['total']
        except sqlite3.Error as e:
            logger.error(f"Error calculando monto semanal: {e}")
            return 0.0
        finally:
            conn.close()

    # --- Configuración ---

    def obtener_config(self, clave: str, default: str = '') -> str:
        """Obtiene un valor de configuración."""
        conn = self._conectar()
        try:
            row = conn.execute(
                "SELECT valor FROM configuracion WHERE clave = ?",
                (clave,)
            ).fetchone()
            return row['valor'] if row else default
        except sqlite3.Error as e:
            logger.error(f"Error obteniendo config '{clave}': {e}")
            return default
        finally:
            conn.close()

    def guardar_config(self, clave: str, valor: str):
        """Guarda o actualiza un valor de configuración."""
        conn = self._conectar()
        try:
            ahora = datetime.utcnow().isoformat()
            conn.execute(
                """INSERT INTO configuracion (clave, valor, actualizado)
                   VALUES (?, ?, ?)
                   ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado = ?""",
                (clave, valor, ahora, valor, ahora)
            )
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error guardando config '{clave}': {e}")
        finally:
            conn.close()

    def es_modo_auto(self) -> bool:
        """Verifica si el modo automático está activado."""
        return self.obtener_config('modo_auto', 'false').lower() == 'true'

    def set_modo_auto(self, activo: bool):
        """Activa o desactiva el modo automático."""
        self.guardar_config('modo_auto', str(activo).lower())

    def obtener_balance_inicial(self) -> Optional[float]:
        """Obtiene el balance inicial registrado."""
        val = self.obtener_config('balance_inicial', '')
        return float(val) if val else None

    def guardar_balance_inicial(self, balance: float):
        """Guarda el balance inicial para cálculo de stop-loss."""
        self.guardar_config('balance_inicial', str(balance))
