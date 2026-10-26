import React from 'react';
import { Redirect } from 'expo-router';

// Client round 12-Oct-26 (#16): the old "Performance Results" page duplicated Performance Data
// (with Power Balance / Air Density / AB Temperature, which are no longer wanted). Anything that
// still routes here now lands on the single Performance Data page.
export default function Results() {
  return <Redirect href="/performance-data" />;
}
