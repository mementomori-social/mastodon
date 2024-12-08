import api from '../api';

export const ALGORITHM_PREFERENCES_FETCH_REQUEST = 'ALGORITHM_PREFERENCES_FETCH_REQUEST';
export const ALGORITHM_PREFERENCES_FETCH_SUCCESS = 'ALGORITHM_PREFERENCES_FETCH_SUCCESS';
export const ALGORITHM_PREFERENCES_FETCH_FAIL    = 'ALGORITHM_PREFERENCES_FETCH_FAIL';
export const ALGORITHM_PREFERENCES_UPDATE        = 'ALGORITHM_PREFERENCES_UPDATE';

export function fetchAlgorithmPreferences() {
  return (dispatch, getState) => {
    dispatch(fetchAlgorithmPreferencesRequest());

    api(getState).get('/api/v1/algorithm_preferences').then(response => {
      dispatch(fetchAlgorithmPreferencesSuccess(response.data));
    }).catch(error => {
      dispatch(fetchAlgorithmPreferencesFail(error));
    });
  };
}

export function updateAlgorithmPreferences(preferences) {
  return (dispatch, getState) => {
    dispatch(algorithmPreferencesUpdate(preferences));

    api(getState).put('/api/v1/algorithm_preferences', preferences).catch(error => {
      // Handle error
    });
  };
}
