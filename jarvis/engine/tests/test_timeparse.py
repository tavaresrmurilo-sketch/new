from datetime import datetime

import pytest

from jarvis_engine.core.timeparse import next_occurrence, parse_when

NOW = datetime(2026, 9, 27, 14, 0).astimezone()  # a Sunday


@pytest.mark.parametrize("text,expected_due,recurrence_type,message", [
    ("Lembre-me amanhã às 15h de ligar para o João", "28/09 15:00", None, "Ligar para o João"),
    ("daqui a vinte minutos tirar o bolo do forno", "27/09 14:20", None, "Tirar o bolo do forno"),
    ("me lembre em 5 minutos de beber água", "27/09 14:05", None, "Beber água"),
    ("todo sábado às 10h regar as plantas", "03/10 10:00", "weekly", "Regar as plantas"),
    ("lembre-me hoje às 18:30 da reunião", "27/09 18:30", None, "Reunião"),
    ("lembre-me às 9h de enviar o relatório", "28/09 09:00", None, "Enviar o relatório"),
    ("remind me tomorrow at 3pm to call mom", "28/09 15:00", None, "Call mom"),
    ("lembre-me sexta às 9 de pagar a conta", "02/10 09:00", None, "Pagar a conta"),
    ("lembre-me dia 15/10 às 14h da consulta", "15/10 14:00", None, "Consulta"),
    ("lembre-me daqui a uma hora e meia de sair", "27/09 15:30", None, "Sair"),
    ("lembre-me todos os dias às 8h de tomar remédio", "28/09 08:00", "daily", "Tomar remédio"),
    ("lembre-me a cada 2 horas de alongar", "27/09 16:00", "interval", "Alongar"),
    ("lembre-me amanhã de manhã de comprar pão", "28/09 09:00", None, "Comprar pão"),
    ("lembre-me dia 3 de outubro de pagar o aluguel", "03/10 09:00", None, "Pagar o aluguel"),
])
def test_parse_when(text, expected_due, recurrence_type, message):
    w = parse_when(text, NOW)
    assert w is not None
    assert w.due.strftime("%d/%m %H:%M") == expected_due
    assert (w.recurrence or {}).get("type") == recurrence_type
    assert w.message == message


def test_no_time_returns_none():
    assert parse_when("lembre-me de algo", NOW) is None


def test_next_occurrence_weekly_and_daily():
    nxt = next_occurrence({"type": "weekly", "weekday": 5, "time": "10:00"}, NOW)
    assert nxt.strftime("%a %H:%M") == "Sat 10:00"
    nxt = next_occurrence({"type": "daily", "time": "08:00"}, NOW)
    assert nxt.strftime("%d %H:%M") == "28 08:00"
