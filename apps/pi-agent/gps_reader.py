import os
import random
import threading
import logging
from datetime import datetime, timezone
from typing import Optional
import pynmea2
from models import Telemetry, DeviceHealth

logger = logging.getLogger("pi-agent")

class GPSState:
    def __init__(self, mode: str):
        self._lock = threading.Lock()
        self.configured_mode = mode.lower()  # 'auto', 'hardware', 'live', 'mock'
        self.port = os.getenv("GPS_SERIAL_PORT", "/dev/ttyAMA0")
        
        # Real GPS parameters
        self.fix = False
        self.timestamp = None           # datetime, UTC timezone-aware
        self.latitude = None
        self.longitude = None
        self.altitude_meters = None
        self.satellites_used = None
        self.satellites_in_view = None
        self.hdop = None
        self.speed_kph = None
        
        # Parser statistics & health metrics
        self.startup_time = datetime.now(timezone.utc)
        self.sentences_received = 0
        self.sentences_parsed = 0
        self.parse_errors = 0
        self.reconnect_attempts = 0
        self.serial_connected = False
        self.last_error: Optional[str] = None
        
        self.last_sentence_at = None   # datetime, UTC timezone-aware
        
        # Mock generator fallback state
        self.mock_lat = 33.73
        self.mock_lon = -118.29
        self.mock_speed = 15.4
        self.mock_heading = 45.0
        
        # Coordinate Privacy (stable session-level offset)
        self.demo_offset_lat = random.uniform(-0.05, 0.05)
        self.demo_offset_lon = random.uniform(-0.05, 0.05)
        self._last_log_state = None

    @property
    def mode(self) -> str:
        return self.configured_mode

    @mode.setter
    def mode(self, value: str):
        self.configured_mode = value.lower()

    def update_from_nmea(self, sentence: str) -> bool:
        """
        Parses a single NMEA sentence and updates state.
        Returns True if parsed successfully, False otherwise.
        """
        with self._lock:
            self.sentences_received += 1
            try:
                msg = pynmea2.parse(sentence)
                stype = msg.sentence_type
                parsed_any = False
                
                if stype == 'GGA':
                    self.fix = msg.gps_qual > 0
                    if msg.latitude is not None and msg.latitude != 0.0:
                        self.latitude = float(msg.latitude)
                    if msg.longitude is not None and msg.longitude != 0.0:
                        self.longitude = float(msg.longitude)
                    if msg.altitude is not None:
                        self.altitude_meters = float(msg.altitude)
                    if msg.num_sats is not None:
                        self.satellites_used = int(msg.num_sats)
                    if msg.horizontal_dil is not None:
                        self.hdop = float(msg.horizontal_dil)
                    if msg.timestamp is not None:
                        now = datetime.now(timezone.utc)
                        self.timestamp = datetime.combine(now.date(), msg.timestamp).replace(tzinfo=timezone.utc)
                    parsed_any = True

                elif stype == 'RMC':
                    self.fix = msg.status == 'A'
                    if msg.latitude is not None and msg.latitude != 0.0:
                        self.latitude = float(msg.latitude)
                    if msg.longitude is not None and msg.longitude != 0.0:
                        self.longitude = float(msg.longitude)
                    if msg.spd_over_grnd is not None:
                        self.speed_kph = float(msg.spd_over_grnd) * 1.852
                    
                    if msg.timestamp is not None:
                        if msg.datestamp is not None:
                            self.timestamp = datetime.combine(msg.datestamp, msg.timestamp).replace(tzinfo=timezone.utc)
                        else:
                            now = datetime.now(timezone.utc)
                            self.timestamp = datetime.combine(now.date(), msg.timestamp).replace(tzinfo=timezone.utc)
                    parsed_any = True

                elif stype == 'GSA':
                    self.fix = msg.mode_fix_type in ('2', '3')
                    if msg.hdop is not None:
                        try:
                            self.hdop = float(msg.hdop)
                        except ValueError:
                            pass
                    parsed_any = True

                elif stype == 'GSV':
                    if hasattr(msg, 'num_sv_in_view') and msg.num_sv_in_view is not None:
                        try:
                            self.satellites_in_view = int(msg.num_sv_in_view)
                        except ValueError:
                            pass
                    parsed_any = True

                elif stype == 'GLL':
                    self.fix = msg.status == 'A'
                    if msg.latitude is not None and msg.latitude != 0.0:
                        self.latitude = float(msg.latitude)
                    if msg.longitude is not None and msg.longitude != 0.0:
                        self.longitude = float(msg.longitude)
                    if msg.timestamp is not None:
                        now = datetime.now(timezone.utc)
                        self.timestamp = datetime.combine(now.date(), msg.timestamp).replace(tzinfo=timezone.utc)
                    parsed_any = True

                elif stype == 'VTG':
                    if hasattr(msg, 'spd_over_grnd_kmph') and msg.spd_over_grnd_kmph is not None:
                        try:
                            self.speed_kph = float(msg.spd_over_grnd_kmph)
                        except ValueError:
                            pass
                    elif hasattr(msg, 'spd_over_grnd_kts') and msg.spd_over_grnd_kts is not None:
                        try:
                            self.speed_kph = float(msg.spd_over_grnd_kts) * 1.852
                        except ValueError:
                            pass
                    parsed_any = True

                if parsed_any:
                    self.sentences_parsed += 1
                    self.last_sentence_at = datetime.now(timezone.utc)
                    return True
                else:
                    return False
                    
            except Exception as e:
                self.parse_errors += 1
                self.last_error = str(e)
                logger.warning(f"Failed to parse NMEA sentence: {e}")
                return False

    def get_telemetry_snapshot(self, public_demo_mode: bool, stale_after_seconds: float) -> Telemetry:
        """
        Returns a thread-safe snapshot/copy of telemetry data.
        Selects 'live' source when serial is connected and receiving NMEA sentences within timeout,
        otherwise falls back to 'mock' source with explicit fallback logging.
        """
        with self._lock:
            now = datetime.now(timezone.utc)
            data_age = None
            if self.last_sentence_at is not None:
                data_age = (now - self.last_sentence_at).total_seconds()
            
            is_explicit_mock = self.configured_mode in ("mock", "demo")
            has_recent_data = (
                self.last_sentence_at is not None
                and data_age is not None
                and data_age <= stale_after_seconds
            )
            is_live_active = not is_explicit_mock and self.serial_connected and has_recent_data

            if is_live_active:
                active_source = "live"
                active_gps_mode = "live"
                fallback_reason = None
                current_fix = self.fix
                lat = self.latitude
                lon = self.longitude
                alt = self.altitude_meters
                sats_used = self.satellites_used
                sats_view = self.satellites_in_view
                hdop_val = self.hdop
                speed = self.speed_kph
                ts = self.timestamp
            else:
                active_source = "mock"
                active_gps_mode = "mock"
                # If explicit mock mode, fix is active; if live serial has no fix/stale, fix is False
                if is_explicit_mock:
                    current_fix = True
                    lat = self.mock_lat
                    lon = self.mock_lon
                    alt = 31.6
                    sats_used = 8
                    sats_view = 12
                    hdop_val = 0.9
                    speed = self.mock_speed
                    ts = now
                else:
                    current_fix = self.fix if self.serial_connected and not (data_age and data_age > stale_after_seconds) else False
                    lat = self.latitude if self.latitude is not None else self.mock_lat
                    lon = self.longitude if self.longitude is not None else self.mock_lon
                    alt = self.altitude_meters
                    sats_used = self.satellites_used
                    sats_view = self.satellites_in_view
                    hdop_val = self.hdop
                    speed = self.speed_kph
                    ts = self.timestamp or now

                if is_explicit_mock:
                    fallback_reason = "Explicit mock mode enabled in configuration (GPS_MODE=mock)"
                elif not self.serial_connected:
                    fallback_reason = f"Serial port {self.port} unavailable: {self.last_error or 'Serial device disconnected'}"
                elif self.last_sentence_at is None:
                    fallback_reason = f"No NMEA sentence received yet on serial port {self.port}"
                else:
                    fallback_reason = f"Telemetry data stale (> {stale_after_seconds:.1f}s since last NMEA sentence on {self.port})"

            # Health status
            is_stale = (data_age is not None and data_age > stale_after_seconds)
            is_never_received = (self.last_sentence_at is None)
            
            if is_explicit_mock:
                health_status = "healthy"
            elif not self.serial_connected:
                health_status = "unhealthy"
            elif is_never_received or is_stale:
                health_status = "degraded"
            elif self.sentences_received > 0 and (self.parse_errors / self.sentences_received) > 0.2:
                health_status = "degraded"
            else:
                health_status = "healthy"

            # Log source decision when state changes
            log_key = (active_source, self.port, current_fix, fallback_reason)
            if log_key != self._last_log_state:
                self._last_log_state = log_key
                logger.info(
                    f"[TELEMETRY SOURCE] Selected: '{active_source}' | Port: '{self.port}' | "
                    f"Serial Connected: {self.serial_connected} | Fix Status: {current_fix} | "
                    f"Fallback Reason: {fallback_reason or 'None'}"
                )

            if public_demo_mode and lat is not None and lon is not None:
                lat = round(lat + self.demo_offset_lat, 4)
                lon = round(lon + self.demo_offset_lon, 4)

            uptime = (now - self.startup_time).total_seconds()
            cpu_temp = None
            if not is_explicit_mock:
                try:
                    if os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
                        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                            cpu_temp = float(f.read().strip()) / 1000.0
                except Exception:
                    pass

            health = DeviceHealth(
                status=health_status,
                gps_mode=active_gps_mode,
                serial_connected=self.serial_connected if not is_explicit_mock else True,
                sentences_received=self.sentences_received,
                sentences_parsed=self.sentences_parsed,
                parse_errors=self.parse_errors,
                reconnect_attempts=self.reconnect_attempts,
                last_error=self.last_error or fallback_reason,
                cpu_temperature_c=cpu_temp,
                uptime_seconds=uptime,
                last_sentence_at=self.last_sentence_at,
                data_age_seconds=data_age
            )

            return Telemetry(
                fix=current_fix,
                timestamp=ts,
                latitude=lat,
                longitude=lon,
                altitude_meters=alt,
                satellites_used=sats_used,
                satellites_in_view=sats_view,
                hdop=hdop_val,
                speed_kph=speed,
                source=active_source,
                device_health=health
            )


_gps_state: Optional[GPSState] = None
_reader_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


def get_gps_state() -> GPSState:
    global _gps_state
    if _gps_state is None:
        mode = os.getenv("GPS_MODE", "auto").lower()
        _gps_state = GPSState(mode=mode)
    return _gps_state


def calculate_nmea_checksum(data: str) -> str:
    checksum = 0
    for char in data:
        checksum ^= ord(char)
    return f"{checksum:02X}"


def mock_reader_loop(state: GPSState, stop_event: threading.Event):
    logger.info("GPS_MODE is mock: starting background NMEA generator thread.")
    
    base_lat = 33.73
    base_lon = -118.29
    altitude = 31.6
    speed_kph = 15.4
    heading = 45.0
    
    import time
    
    while not stop_event.is_set():
        lat_offset = random.uniform(-0.0005, 0.0005)
        lon_offset = random.uniform(-0.0005, 0.0005)
        lat = base_lat + lat_offset
        lon = base_lon + lon_offset
        
        speed_kph += random.uniform(-0.5, 0.5)
        speed_kph = max(0.0, min(120.0, speed_kph))
        speed_knots = speed_kph / 1.852
        
        sats_used = random.randint(7, 10)
        sats_in_view = random.randint(10, 14)
        hdop = round(random.uniform(0.8, 1.2), 2)
        
        now = datetime.now(timezone.utc)
        time_str = now.strftime("%H%M%S.%f")[:-3]
        date_str = now.strftime("%d%m%y")
        
        def to_nmea_coord(coord, is_lat):
            abs_val = abs(coord)
            degrees = int(abs_val)
            minutes = (abs_val - degrees) * 60.0
            if is_lat:
                direction = 'N' if coord >= 0 else 'S'
                return f"{degrees:02d}{minutes:07.4f}", direction
            else:
                direction = 'E' if coord >= 0 else 'W'
                return f"{degrees:03d}{minutes:07.4f}", direction
                
        lat_nmea, lat_dir = to_nmea_coord(lat, True)
        lon_nmea, lon_dir = to_nmea_coord(lon, False)
        
        gga = f"GPGGA,{time_str},{lat_nmea},{lat_dir},{lon_nmea},{lon_dir},1,{sats_used:02d},{hdop:.1f},{altitude:.1f},M,0.0,M,,"
        gga_sentence = f"${gga}*{calculate_nmea_checksum(gga)}"
        
        rmc = f"GPRMC,{time_str},A,{lat_nmea},{lat_dir},{lon_nmea},{lon_dir},{speed_knots:.1f},{heading:.1f},{date_str},,,A"
        rmc_sentence = f"${rmc}*{calculate_nmea_checksum(rmc)}"
        
        gsa = f"GPGSA,A,3,01,02,03,04,05,,,,,,,,{hdop * 1.5:.1f},{hdop:.1f},{hdop * 1.2:.1f}"
        gsa_sentence = f"${gsa}*{calculate_nmea_checksum(gsa)}"
        
        gsv = f"GPGSV,1,1,{sats_in_view:02d},01,40,083,45,02,17,308,40,03,07,344,35"
        gsv_sentence = f"${gsv}*{calculate_nmea_checksum(gsv)}"
        
        gll = f"GPGLL,{lat_nmea},{lat_dir},{lon_nmea},{lon_dir},{time_str},A,A"
        gll_sentence = f"${gll}*{calculate_nmea_checksum(gll)}"
        
        vtg = f"GPVTG,{heading:.1f},T,,M,{speed_knots:.1f},N,{speed_kph:.1f},K,A"
        vtg_sentence = f"${vtg}*{calculate_nmea_checksum(vtg)}"
        
        for sentence in [gga_sentence, rmc_sentence, gsa_sentence, gsv_sentence, gll_sentence, vtg_sentence]:
            state.update_from_nmea(sentence)
            
        for _ in range(10):
            if stop_event.is_set():
                break
            time.sleep(0.1)


def serial_reader_loop(state: GPSState, stop_event: threading.Event):
    port = state.port
    baud = int(os.getenv("GPS_BAUD_RATE", "9600"))
    
    logger.info(f"Starting background serial thread on {port} at {baud} baud.")
    
    backoff_delay = 1.0
    max_backoff = 30.0
    
    import serial
    import time
    
    while not stop_event.is_set():
        try:
            state.serial_connected = False
            with serial.Serial(port, baud, timeout=1.0) as ser:
                state.serial_connected = True
                backoff_delay = 1.0
                logger.info(f"Successfully opened serial port {port}.")
                
                while not stop_event.is_set():
                    line = ser.readline()
                    if not line:
                        continue
                    try:
                        decoded_line = line.decode('ascii', errors='ignore').strip()
                        if decoded_line.startswith('$'):
                            state.update_from_nmea(decoded_line)
                    except Exception as e:
                        logger.warning(f"Error reading/decoding line from serial port: {e}")
                        state.parse_errors += 1
                        state.last_error = str(e)
        except Exception as e:
            state.serial_connected = False
            state.reconnect_attempts += 1
            state.last_error = f"Serial port error: {e}"
            logger.error(f"Failed to open/read serial port {port}: {e}. Retrying in {backoff_delay:.1f}s...")
            
            steps = int(backoff_delay / 0.1)
            for _ in range(max(1, steps)):
                if stop_event.is_set():
                    break
                time.sleep(0.1)
                
            backoff_delay = min(max_backoff, backoff_delay * 2.0)


def start_gps_reader():
    global _reader_thread, _stop_event
    state = get_gps_state()
    
    _stop_event.clear()
    
    if state.configured_mode in ("mock", "demo"):
        target_fn = mock_reader_loop
    else:
        target_fn = serial_reader_loop
        
    _reader_thread = threading.Thread(target=target_fn, args=(state, _stop_event), daemon=True)
    _reader_thread.start()
    logger.info(f"GPS reader thread started in mode '{state.configured_mode}'.")


def stop_gps_reader():
    global _reader_thread, _stop_event
    if _stop_event is not None:
        _stop_event.set()
    if _reader_thread is not None:
        _reader_thread.join(timeout=3.0)
        logger.info("GPS reader thread stopped.")


def get_telemetry() -> Telemetry:
    state = get_gps_state()
    public_demo = os.getenv("PUBLIC_DEMO_MODE", "false").lower() in ("true", "1", "yes")
    stale_secs = float(os.getenv("GPS_STALE_AFTER_SECONDS", "5"))
    return state.get_telemetry_snapshot(public_demo_mode=public_demo, stale_after_seconds=stale_secs)