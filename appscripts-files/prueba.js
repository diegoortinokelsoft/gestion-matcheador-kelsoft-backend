function prueba() {
  let variable = "a";
  Logger.log(get_initiative_by_id(variable))
}

function test_create_session() {
  const user_id = 29;

  const session_data = {
    user_name: "Diego",
    user_team: "Team_A",
    user_leader: "Leader_1",
    session_date: "04/03/2026",
    goal_mode: "SESSION_TOTAL",
    goal_target_total: 50
  };

  const response = create_session(user_id, session_data);
  Logger.log(response);
}

function test_get_open_session_by_user_and_date() {
  const user_id = 101;
  const session_date = "04/03/2026";

  const response = get_open_session_by_user_and_date(user_id, session_date);
  Logger.log(response);
}