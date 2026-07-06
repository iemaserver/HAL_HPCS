/**
 * Global app state: selected aircraft, live config (formulas + defaults),
 * current inputs, computed outputs. Backed by SQLite for persistence.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_AIRCRAFT,
  DEFAULT_FORMULAS,
  computePerformance,
} from '../constants/logic';
import {
  loadAircraftDefaults,
  loadFormulas,
  saveAircraftDefaults,
  saveFormulas,
} from '../services/database';

const Ctx = createContext(null);

export const AppStateProvider = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [aircraftDefaults, setAircraftDefaults] = useState(DEFAULT_AIRCRAFT);
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);
  const [selectedAircraftId, setSelectedAircraftId] = useState('chetak');
  const [units, setUnits] = useState({
    altitude: 'ft',
    temperature: 'C',
    weight: 'kg',
    pressure: 'hPa',
  });
  const [inputs, setInputsState] = useState({
    elevation: null,
    qnh: null,
    temperature: null,
    acWeight: null,
    crewWeight: null,
    fuel: null,
    additionalLoad: null,
    payload: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const [ad, f] = await Promise.all([loadAircraftDefaults(), loadFormulas()]);
        setAircraftDefaults(ad);
        setFormulas(f);
        // Do NOT auto-fill input fields — user explicitly wants blank inputs.
      } catch (e) {
        console.warn('DB load failed, using defaults', e);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the aircraft changes, keep inputs blank (user enters everything).
  useEffect(() => {
    if (!ready) return;
    // intentionally no auto-fill
  }, [selectedAircraftId, ready]);

  const setInputs = (v) => setInputsState((prev) => ({ ...prev, ...v }));

  const setUnit = (k, v) => setUnits((prev) => ({ ...prev, [k]: v }));

  const updateAircraftDefaults = async (d) => {
    setAircraftDefaults(d);
    await saveAircraftDefaults(d);
  };

  const updateFormulas = async (f) => {
    setFormulas(f);
    await saveFormulas(f);
  };

  const resetInputsToDefaults = () => {
    setInputsState({
      elevation: null,
      qnh: null,
      temperature: null,
      acWeight: null,
      crewWeight: null,
      fuel: null,
      additionalLoad: null,
      payload: null,
    });
  };

  const outputs = useMemo(() => {
    const ac = aircraftDefaults[selectedAircraftId];
    return computePerformance({ aircraft: ac, ...inputs }, formulas);
  }, [aircraftDefaults, selectedAircraftId, inputs, formulas]);

  const value = {
    ready,
    aircraftDefaults,
    formulas,
    selectedAircraftId,
    setSelectedAircraftId,
    inputs,
    setInputs,
    units,
    setUnit,
    outputs,
    updateAircraftDefaults,
    updateFormulas,
    resetInputsToDefaults,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAppState = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be inside AppStateProvider');
  return v;
};
